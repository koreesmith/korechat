// Package proxy implements a transparent IRC proxy that connects to an upstream
// IRC server over TCP (plain text, port 6667) and bridges it bidirectionally
// to a WebSocket client. The client speaks raw IRC; the proxy simply relays it.
//
// Architecture:
//
//	Browser WS ──► proxy.readFromWS  ──► upstream TCP write
//	Browser WS ◄── proxy.readFromUpstream ◄── upstream TCP read
//
// The proxy injects synthetic "status" messages as IRC NOTICEs prefixed with
// "*korechat*" so the client UI can show connection events without a special
// protocol.
package proxy

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/koree/korechat/internal/networks"
)

const (
	dialTimeout      = 15 * time.Second
	upstreamDeadline = 120 * time.Second // reset on each line received
	writeTimeout     = 10 * time.Second
)

// SendFunc delivers a raw IRC line to the WebSocket client.
type SendFunc func(line string)

// Proxy manages one upstream IRC TCP connection for one WS session.
type Proxy struct {
	networkID string
	network   *networks.Network
	store     *networks.Store

	send    SendFunc       // write to browser WS
	conn    net.Conn       // upstream TCP socket
	mu      sync.Mutex

	stopCh  chan struct{}
	stopped bool

	// Track nick in use (for alt-nick fallback)
	currentNick string
	nickRetries int
}

// New creates a Proxy but does not connect yet.
func New(store *networks.Store, networkID string, send SendFunc) (*Proxy, error) {
	n, ok := store.Get(networkID)
	if !ok {
		return nil, fmt.Errorf("network %q not found", networkID)
	}
	return &Proxy{
		networkID:   networkID,
		network:     n,
		store:       store,
		send:        send,
		stopCh:      make(chan struct{}),
		currentNick: n.Nick,
	}, nil
}

// Connect dials the upstream IRC server and starts the proxy goroutines.
// It returns immediately; connection events are sent via SendFunc as IRC NOTICEs.
func (p *Proxy) Connect() {
	p.store.SetStatus(p.networkID, networks.StatusConnecting, "")
	p.notice(fmt.Sprintf("Connecting to %s (%s)…", p.network.Name, p.network.Addr()))

	go p.dial()
}

// Send forwards a raw IRC line from the browser to the upstream server.
// Called by the WS session read pump for every line the browser sends.
func (p *Proxy) Send(line string) {
	p.mu.Lock()
	conn := p.conn
	p.mu.Unlock()

	if conn == nil {
		p.notice("Not connected to " + p.network.Name)
		return
	}
	conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	if _, err := fmt.Fprintf(conn, "%s\r\n", line); err != nil {
		log.Printf("proxy[%s]: upstream write error: %v", p.networkID, err)
		p.handleUpstreamDisconnect(err)
	}
}

// Disconnect tears down the upstream connection gracefully.
func (p *Proxy) Disconnect(reason string) {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}
	p.stopped = true
	conn := p.conn
	p.mu.Unlock()

	if conn != nil {
		fmt.Fprintf(conn, "QUIT :%s\r\n", reason)
		conn.Close()
	}
	close(p.stopCh)
	p.store.SetStatus(p.networkID, networks.StatusDisconnected, "")
	p.notice("Disconnected from " + p.network.Name)
}

// ─── Internal ─────────────────────────────────────────────────────────────────

func (p *Proxy) dial() {
	conn, err := net.DialTimeout("tcp", p.network.Addr(), dialTimeout)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to connect to %s: %v", p.network.Addr(), err)
		log.Printf("proxy[%s]: %s", p.networkID, errMsg)
		p.store.SetStatus(p.networkID, networks.StatusError, errMsg)
		p.notice(errMsg)
		return
	}

	p.mu.Lock()
	p.conn = conn
	p.mu.Unlock()

	log.Printf("proxy[%s]: TCP connected to %s", p.networkID, p.network.Addr())
	p.store.SetStatus(p.networkID, networks.StatusConnecting, "Registering…")

	// Send IRC registration sequence
	p.sendRaw("CAP LS 302")
	if p.network.Password != "" {
		p.sendRaw("PASS :" + p.network.Password)
	}
	p.sendRaw(fmt.Sprintf("NICK %s", p.currentNick))
	p.sendRaw(fmt.Sprintf("USER %s 0 * :%s", p.network.Username, p.network.Realname))
	p.sendRaw("CAP END")

	// Start reading from upstream
	go p.readFromUpstream()
}

func (p *Proxy) readFromUpstream() {
	p.mu.Lock()
	conn := p.conn
	p.mu.Unlock()

	if conn == nil {
		return
	}

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 8192), 8192)

	for scanner.Scan() {
		select {
		case <-p.stopCh:
			return
		default:
		}

		line := scanner.Text()
		conn.SetReadDeadline(time.Now().Add(upstreamDeadline))

		// Intercept select messages for proxy-level handling
		p.interceptUpstream(line)

		// Forward all lines to the browser
		p.send(line)
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		p.handleUpstreamDisconnect(err)
	} else {
		p.handleUpstreamDisconnect(nil)
	}
}

// interceptUpstream inspects messages from the upstream server for proxy-level concerns.
func (p *Proxy) interceptUpstream(line string) {
	// Parse minimally — we only care about a handful of numerics/commands
	parts := strings.SplitN(line, " ", 4)
	if len(parts) < 2 {
		return
	}

	// Strip prefix if present
	idx := 0
	if strings.HasPrefix(parts[0], ":") {
		idx = 1
	}
	if len(parts) <= idx {
		return
	}
	cmd := strings.ToUpper(parts[idx])

	switch cmd {
	case "001":
		// Registration complete
		p.store.SetStatus(p.networkID, networks.StatusConnected, "")
		log.Printf("proxy[%s]: registered on %s as %s", p.networkID, p.network.Name, p.currentNick)
		// Auto-join channels after a brief delay to let the server finish welcome burst
		go func() {
			time.Sleep(500 * time.Millisecond)
			for _, ch := range p.network.AutoJoin {
				ch = strings.TrimSpace(ch)
				if ch == "" {
					continue
				}
				if !strings.HasPrefix(ch, "#") {
					ch = "#" + ch
				}
				p.sendRaw("JOIN " + ch)
			}
		}()

	case "433":
		// ERR_NICKNAMEINUSE — try alt nick
		p.nickRetries++
		if p.nickRetries == 1 && p.network.AltNick != "" {
			p.currentNick = p.network.AltNick
		} else {
			p.currentNick = p.network.Nick + strings.Repeat("_", p.nickRetries)
		}
		log.Printf("proxy[%s]: nick in use, trying %s", p.networkID, p.currentNick)
		p.sendRaw("NICK " + p.currentNick)

	case "PING":
		// Must respond immediately — upstream will disconnect if we don't
		token := ""
		if len(parts) > idx+1 {
			token = parts[idx+1]
		}
		p.sendRaw("PONG " + token)
		// Do NOT forward PING to the browser; let the browser manage its own heartbeat
		// (We re-send it anyway since we already called p.send(line) in the caller)
		// Note: we can't easily suppress it here since we already forward; PING from
		// server is harmless for the client to receive.

	case "ERROR":
		log.Printf("proxy[%s]: server sent ERROR: %s", p.networkID, line)
		p.store.SetStatus(p.networkID, networks.StatusError, line)
	}
}

func (p *Proxy) sendRaw(line string) {
	p.mu.Lock()
	conn := p.conn
	p.mu.Unlock()
	if conn == nil {
		return
	}
	conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	fmt.Fprintf(conn, "%s\r\n", line)
}

func (p *Proxy) handleUpstreamDisconnect(err error) {
	p.mu.Lock()
	alreadyStopped := p.stopped
	p.stopped = true
	if p.conn != nil {
		p.conn.Close()
		p.conn = nil
	}
	p.mu.Unlock()

	if alreadyStopped {
		return
	}

	if err != nil {
		msg := fmt.Sprintf("Connection to %s lost: %v", p.network.Name, err)
		p.store.SetStatus(p.networkID, networks.StatusError, msg)
		p.notice(msg)
		log.Printf("proxy[%s]: %s", p.networkID, msg)
	} else {
		p.store.SetStatus(p.networkID, networks.StatusDisconnected, "")
		p.notice("Connection to " + p.network.Name + " closed.")
		log.Printf("proxy[%s]: upstream disconnected cleanly", p.networkID)
	}

	// Synthesise a QUIT so the client UI cleans up channel membership
	p.send(fmt.Sprintf(":%s!%s@%s QUIT :Connection lost", p.currentNick, p.network.Username, p.network.Host))
}

// notice sends a synthetic IRC NOTICE to the browser with a status message.
// Prefixed with *korechat* so the UI can style it as a server notice.
func (p *Proxy) notice(text string) {
	p.send(fmt.Sprintf(":*korechat* NOTICE * :%s", text))
}
