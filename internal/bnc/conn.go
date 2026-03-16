// Package bnc implements a persistent IRC bouncer layer.
//
// Architecture:
//
//	Manager
//	  └── Conn  (one per network, server-lifetime)
//	        ├── upstream TCP (persistent — survives browser disconnects)
//	        ├── RingBuffer  (last BufferSize lines per channel + server)
//	        └── subscribers (active WS sessions; may be zero)
//
// When a browser connects:
//  1. Manager.Subscribe(networkID, sendFn) → attaches subscriber to existing Conn
//  2. Conn replays ring buffer to the new subscriber
//  3. All subsequent upstream lines go to all subscribers
//
// When the browser disconnects:
//  1. Manager.Unsubscribe removes the subscriber
//  2. Upstream TCP connection stays open — the user is still "online" on IRC
//
// Reconnect logic: exponential backoff (5s → 10s → 20s → ... → 300s cap).
package bnc

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/koree/korechat/internal/networks"
)

const (
	dialTimeout       = 15 * time.Second
	writeTimeout      = 10 * time.Second
	keepaliveInterval = 30 * time.Second  // how often we PING the upstream
	keepaliveTimeout  = 90 * time.Second  // how long without any data before giving up
	BufferSize        = 500               // lines retained per channel/server
	maxBackoff        = 30 * time.Second   // cap at 30s so reconnect is prompt
	initialBackoff    = 2 * time.Second
)

// SendFunc delivers a raw IRC line to one WebSocket client.
type SendFunc func(line string)

// subscriber is one active browser WS session attached to a Conn.
type subscriber struct {
	id   string
	send SendFunc
}

// RingBuffer is a fixed-capacity circular buffer of raw IRC lines.
type RingBuffer struct {
	buf  []string
	head int // next write position
	n    int // number of valid entries
	cap  int
}

func newRingBuffer(cap int) *RingBuffer { return &RingBuffer{buf: make([]string, cap), cap: cap} }

func (r *RingBuffer) Push(line string) {
	r.buf[r.head] = line
	r.head = (r.head + 1) % r.cap
	if r.n < r.cap {
		r.n++
	}
}

// Lines returns all buffered lines in chronological order.
func (r *RingBuffer) Lines() []string {
	if r.n == 0 {
		return nil
	}
	out := make([]string, r.n)
	start := (r.head - r.n + r.cap) % r.cap
	for i := 0; i < r.n; i++ {
		out[i] = r.buf[(start+i)%r.cap]
	}
	return out
}

// LogFunc is called for every loggable incoming IRC line.
// userID is the owner of the network.
type LogFunc func(userID, networkID, networkName, rawLine string)

// Conn is one persistent upstream IRC connection for one network.
// It survives browser disconnects.
type Conn struct {
	net     *networks.Network
	store   *networks.Store
	manager *Manager
	logFn   LogFunc // may be nil

	mu          sync.Mutex
	tcpConn     net.Conn
	currentNick string
	nickRetries int
	stopped     bool      // true = intentional shutdown (no reconnect)
	connected   bool

	// channels we have JOINed on the upstream
	joinedChans map[string]bool

	// per-channel (and "__server__") ring buffers
	buffers map[string]*RingBuffer

	// active browser sessions
	subs map[string]*subscriber

	// channel to signal the read loop to exit
	stopCh chan struct{}

	// reconnect
	backoff    time.Duration
	retryCount int // number of reconnect attempts since last successful connect

	// keepalive tracking
	lastPong time.Time

	// Developer options
	ircDebug bool // log raw ← recv and → send lines

	// SASL state (used during registration)
	saslDone bool

	// IRCv3 capability tracking
	serverCaps  map[string]bool // caps advertised by server in CAP LS
	ackedCaps   map[string]bool // caps we successfully negotiated
	capQueue    []string        // caps waiting to be REQ'd one at a time
	capInflight bool            // true when a CAP REQ has been sent but not yet ACK/NAK'd
}

func newConn(n *networks.Network, store *networks.Store, mgr *Manager, logFn LogFunc) *Conn {
	return &Conn{
		net:         n,
		store:       store,
		manager:     mgr,
		logFn:       logFn,
		ircDebug:    mgr.ircDebug,
		joinedChans: make(map[string]bool),
		buffers:     make(map[string]*RingBuffer),
		subs:        make(map[string]*subscriber),
		stopCh:      make(chan struct{}),
		currentNick: n.Nick,
		backoff:     initialBackoff,
		lastPong:    time.Now(),
		serverCaps:  make(map[string]bool),
		ackedCaps:   make(map[string]bool),
	}
}

// Start launches the upstream connection in the background.
// Called once by the Manager when the network is added.
func (c *Conn) Start() {
	go c.connectLoop()
}

// Stop shuts down the connection permanently (no reconnect).
func (c *Conn) Stop() {
	c.mu.Lock()
	c.stopped = true
	tc := c.tcpConn
	c.mu.Unlock()

	select {
	case <-c.stopCh:
	default:
		close(c.stopCh)
	}

	if tc != nil {
		fmt.Fprintf(tc, "QUIT :KoreChat shutting down\r\n")
		tc.Close()
	}
	c.store.SetStatus(c.net.ID, networks.StatusDisconnected, "")
}

// Subscribe attaches a new browser session to this connection.
// It immediately replays the ring buffer to the subscriber.
func (c *Conn) Subscribe(id string, send SendFunc) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.subs[id] = &subscriber{id: id, send: send}

	// Send current connection status as a synthetic notice
	status := string(c.store.StatusOf(c.net.ID))
	send(fmt.Sprintf(":*bnc* NOTICE * :status:%s", status))

	// Replay all buffered lines — server first, then channels.
	// Skip self-JOIN and self-MODE lines: these are artifacts of the BNC joining
	// the channel on behalf of the user and would appear as fake join events on
	// every browser reconnect even though the user never left the channel.
	for _, line := range c.buffers["__server__"].Lines() {
		send(line)
	}
	for chanName, buf := range c.buffers {
		if chanName == "__server__" {
			continue
		}
		for _, line := range buf.Lines() {
			if isSelfMembershipLine(line, c.currentNick) {
				continue
			}
			send(line)
		}
	}

	// If we're connected, resync the client's channel state
	if c.connected {
		send(fmt.Sprintf(":*bnc* NOTICE * :replay-done nick:%s", c.currentNick))
	}
}

// Unsubscribe detaches a browser session. The upstream TCP stays alive.
func (c *Conn) Unsubscribe(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.subs, id)
}

// Send forwards a raw line from the browser to the upstream IRC server.
func (c *Conn) Send(line string) {
	c.mu.Lock()
	tc := c.tcpConn
	c.mu.Unlock()

	if tc == nil {
		c.notice("Not connected — your message was not sent.")
		return
	}
	tc.SetWriteDeadline(time.Now().Add(writeTimeout))
	if _, err := fmt.Fprintf(tc, "%s\r\n", line); err != nil {
		log.Printf("bnc[%s]: upstream write error: %v", c.net.ID, err)
	}
}

// ─── Internal ─────────────────────────────────────────────────────────────────

func (c *Conn) connectLoop() {
	for {
		c.mu.Lock()
		if c.stopped {
			c.mu.Unlock()
			return
		}
		c.mu.Unlock()

		c.dial()

		// dial() returns when the upstream disconnects.
		// Check if we should reconnect.
		c.mu.Lock()
		if c.stopped {
			c.mu.Unlock()
			return
		}
		c.retryCount++
		retry := c.retryCount
		backoff := c.backoff
		c.mu.Unlock()

		// Exponential backoff
		log.Printf("bnc[%s]: reconnecting in %v (attempt %d)", c.net.ID, backoff, retry)
		c.store.SetStatus(c.net.ID, networks.StatusConnecting,
			fmt.Sprintf("reconnecting in %v… (attempt %d)", backoff, retry))
		c.notice(fmt.Sprintf("Reconnecting in %v… (attempt %d)", backoff, retry))

		select {
		case <-c.stopCh:
			return
		case <-time.After(backoff):
		}

		c.mu.Lock()
		c.backoff *= 2
		if c.backoff > maxBackoff {
			c.backoff = maxBackoff
		}
		c.mu.Unlock()
	}
}

func (c *Conn) dial() {
	addr := c.net.Addr()
	c.store.SetStatus(c.net.ID, networks.StatusConnecting, "")
	proto := "TCP"
	if c.net.TLS {
		proto = "TLS"
	}
	c.notice(fmt.Sprintf("Connecting to %s (%s) via %s…", c.net.Name, addr, proto))

	var tc net.Conn
	var err error
	if c.net.TLS {
		tc, err = tls.DialWithDialer(
			&net.Dialer{
				Timeout:   dialTimeout,
				KeepAlive: 60 * time.Second,
			},
			"tcp", addr,
			&tls.Config{ServerName: c.net.Host},
		)
	} else {
		tc, err = (&net.Dialer{
			Timeout:   dialTimeout,
			KeepAlive: 60 * time.Second,
		}).Dial("tcp", addr)
	}
	if err != nil {
		msg := fmt.Sprintf("Failed to connect to %s: %v", addr, err)
		log.Printf("bnc[%s]: %s", c.net.ID, msg)
		c.store.SetStatus(c.net.ID, networks.StatusError, msg)
		c.notice(msg)
		return
	}

	c.mu.Lock()
	c.tcpConn = tc
	c.connected = false
	c.nickRetries = 0
	c.currentNick = c.net.Nick
	c.saslDone = false
	c.capQueue    = nil
	c.capInflight = false
	c.serverCaps = make(map[string]bool)
	c.ackedCaps  = make(map[string]bool)
	c.mu.Unlock()

	log.Printf("bnc[%s]: %s connected to %s", c.net.ID, proto, addr)

	// IRC registration — always negotiate CAP so we can conditionally use SASL
	c.sendRaw("CAP LS 302")
	if c.net.Password != "" {
		c.sendRaw("PASS :" + c.net.Password)
	}
	c.sendRaw(fmt.Sprintf("NICK %s", c.currentNick))
	c.sendRaw(fmt.Sprintf("USER %s 0 * :%s", c.net.Username, c.net.Realname))
	// CAP END is deferred until after SASL if we need it; intercept() handles it

	c.readLoop(tc)

	// Clean up
	c.mu.Lock()
	c.tcpConn = nil
	c.connected = false
	c.mu.Unlock()
}

func (c *Conn) readLoop(tc net.Conn) {
	// No read deadline set here — we keep the connection alive via our own
	// Keepalive: send PING every keepaliveInterval.
	// If we haven't received ANY data from the server within keepaliveTimeout,
	// the upstream is considered dead and we close the connection.
	// We track lastPong but also reset it on any incoming server traffic so
	// that active channels (with lots of messages) never false-trigger.
	c.mu.Lock()
	c.lastPong = time.Now()
	c.mu.Unlock()

	kaStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(keepaliveInterval)
		defer ticker.Stop()
		for {
			select {
			case <-kaStop:
				return
			case <-c.stopCh:
				return
			case <-ticker.C:
				c.mu.Lock()
				last := c.lastPong
				c.mu.Unlock()
				// Check timeout BEFORE sending the next PING.
				// This means: if we haven't received any data since our
				// PREVIOUS ping interval, the connection is dead.
				// Sending PING first then immediately checking gave the
				// server zero time to respond.
				if time.Since(last) > keepaliveTimeout {
					log.Printf("bnc[%s]: keepalive timeout — closing upstream", c.net.ID)
					tc.Close()
					return
				}
				c.sendRaw(fmt.Sprintf("PING :%d", time.Now().UnixMilli()))
			}
		}
	}()
	defer close(kaStop)

	scanner := bufio.NewScanner(tc)
	scanner.Buffer(make([]byte, 8192), 8192)

	for scanner.Scan() {
		select {
		case <-c.stopCh:
			tc.Close()
			return
		default:
		}

		line := scanner.Text()
		// Raw receive log — redact AUTHENTICATE credential lines
		if c.ircDebug {
			logLine := line
			if strings.HasPrefix(strings.ToUpper(line), "AUTHENTICATE ") && line != "AUTHENTICATE +" {
				logLine = "AUTHENTICATE <redacted>"
			}
			log.Printf("bnc[%s] ← %s", c.net.ID, logLine)
		}
		// Any incoming data resets the keepalive timer — we only care that
		// the TCP connection is alive, not specifically that PONG arrived.
		c.mu.Lock()
		c.lastPong = time.Now()
		c.mu.Unlock()
		c.intercept(line)
		c.buffer(line)
		c.fanOut(line)
		// Persist loggable events for the network owner.
		if c.logFn != nil && c.net.UserID != "" {
			c.logFn(c.net.UserID, c.net.ID, c.net.Name, line)
		}
	}

	if err := scanner.Err(); err != nil {
		msg := fmt.Sprintf("Connection to %s lost: %v", c.net.Name, err)
		log.Printf("bnc[%s]: %s", c.net.ID, msg)
		c.store.SetStatus(c.net.ID, networks.StatusError, msg)
		c.notice(msg)
	} else {
		log.Printf("bnc[%s]: upstream closed connection cleanly", c.net.ID)
		c.store.SetStatus(c.net.ID, networks.StatusDisconnected, "")
		c.notice("Connection to " + c.net.Name + " closed.")
	}

	// Synthesise a QUIT so browser clients clean up channel membership
	c.mu.Lock()
	nick := c.currentNick
	c.mu.Unlock()
	quitLine := fmt.Sprintf(":%s!%s@%s QUIT :Connection lost",
		nick, c.net.Username, c.net.Host)
	c.buffer(quitLine)
	c.fanOut(quitLine)
}

// intercept handles proxy-level concerns: PING/PONG, nick tracking,
// auto-join on 001, error handling. Does NOT forward to browser directly.
func (c *Conn) intercept(line string) {
	// Strip IRCv3 message tags (@tag=value ...) before parsing.
	// Tags are always the first token when present, starting with '@'.
	if strings.HasPrefix(line, "@") {
		if sp := strings.Index(line, " "); sp >= 0 {
			line = strings.TrimLeft(line[sp+1:], " ")
		} else {
			return // tags-only line, nothing to parse
		}
	}

	// Split fully (not SplitN) so CAP/KICK/etc. multi-field commands parse correctly.
	// For the trailing parameter (prefixed with ":") we keep it as-is; callers strip ":".
	parts := strings.Split(line, " ")
	if len(parts) < 2 {
		return
	}
	idx := 0
	if strings.HasPrefix(parts[0], ":") {
		idx = 1
	}
	if len(parts) <= idx {
		return
	}
	cmd := strings.ToUpper(parts[idx])

	switch cmd {
	case "PING":
		token := ""
		if len(parts) > idx+1 {
			token = strings.TrimPrefix(parts[idx+1], ":")
		}
		c.sendRaw("PONG :" + token)

	case "PONG":
		// Server replied to our keepalive PING — connection is alive
		c.mu.Lock()
		c.lastPong = time.Now()
		c.mu.Unlock()

	case "CAP":
		// Format: :server CAP <nick> <subcommand> [*] :<caps>
		if len(parts) < idx+3 {
			break
		}
		sub := strings.ToUpper(parts[idx+2])

		// Collect caps list and continuation marker
		isContinuation := false
		caps := ""
		for i := idx + 3; i < len(parts); i++ {
			if parts[i] == "*" {
				isContinuation = true
			} else if strings.HasPrefix(parts[i], ":") {
				caps = strings.TrimPrefix(strings.Join(parts[i:], " "), ":")
				break
			}
		}

		useSASL := c.net.SASLMechanism != ""

		switch sub {
		case "LS":
			// Accumulate advertised caps across multiline responses
			for _, cap := range strings.Fields(caps) {
				// Caps may have values: "cap=value" — store just the name
				name := strings.SplitN(cap, "=", 2)[0]
				c.mu.Lock()
				c.serverCaps[strings.ToLower(name)] = true
				c.mu.Unlock()
			}
			if isContinuation {
				log.Printf("bnc[%s]: CAP LS (partial): %s", c.net.ID, caps)
				break // more lines coming
			}
			c.mu.Lock()
			allCaps := make([]string, 0, len(c.serverCaps))
			for k := range c.serverCaps {
				allCaps = append(allCaps, k)
			}
			c.mu.Unlock()
			log.Printf("bnc[%s]: CAP LS final, server advertises: %v", c.net.ID, allCaps)

			// Build request list: always try to get history-related caps,
			// only request sasl if configured.
			// We request them unconditionally — server will NAK unknown ones.
			// Sending all in one REQ is correct per IRCv3 spec; if NAK'd we'll
			// re-request without the offending cap in the NAK handler.
			wantCaps := []string{
				"batch",
				"server-time",
				"message-tags",
				"chathistory",
				"multi-prefix",
			}
			if useSASL {
				wantCaps = append(wantCaps, "sasl")
			}
			log.Printf("bnc[%s]: CAP REQ: %v", c.net.ID, wantCaps)
			c.sendRaw("CAP REQ :" + strings.Join(wantCaps, " "))

		case "ACK":
			// Record which caps were granted
			for _, cap := range strings.Fields(caps) {
				c.mu.Lock()
				c.ackedCaps[strings.ToLower(strings.TrimPrefix(cap, "-"))] = true
				c.mu.Unlock()
			}
			c.mu.Lock()
			ackedList := make([]string, 0, len(c.ackedCaps))
			for k := range c.ackedCaps {
				ackedList = append(ackedList, k)
			}
			// This ACK resolves the current inflight REQ
			c.capInflight = false
			var nextCap string
			if len(c.capQueue) > 0 {
				nextCap = c.capQueue[0]
				c.capQueue = c.capQueue[1:]
				c.capInflight = true
			}
			queueLen := len(c.capQueue)
			c.mu.Unlock()
			log.Printf("bnc[%s]: CAP ACK, now have: %v (queue remaining=%d)", c.net.ID, ackedList, queueLen)

			if nextCap != "" {
				// More caps to request — send next one
				c.sendRaw("CAP REQ :" + nextCap)
			} else {
				// Queue empty and nothing inflight — proceed
				if useSASL && c.hasAckedCap("sasl") {
					log.Printf("bnc[%s]: CAP negotiation complete, sending AUTHENTICATE %s", c.net.ID, c.net.SASLMechanism)
					c.sendRaw("AUTHENTICATE " + c.net.SASLMechanism)
				} else {
					log.Printf("bnc[%s]: CAP negotiation complete, sending CAP END (no SASL)", c.net.ID)
					c.sendRaw("CAP END")
				}
			}

		case "NAK":
			log.Printf("bnc[%s]: CAP NAK for: %s — retrying individually", c.net.ID, caps)
			nakCaps := strings.Fields(caps)
			if len(nakCaps) > 1 {
				// Bulk NAK — queue remaining caps, send first one now
				c.mu.Lock()
				c.capQueue = append(c.capQueue, nakCaps[1:]...)
				c.capInflight = true
				c.mu.Unlock()
				c.sendRaw("CAP REQ :" + nakCaps[0])
			} else {
				// Single cap rejected
				log.Printf("bnc[%s]: cap %q not supported", c.net.ID, caps)
				if useSASL && strings.Contains(caps, "sasl") {
					c.notice("⚠ Server rejected SASL capability — connected without authentication")
				}
				c.mu.Lock()
				c.capInflight = false
				var nextCap string
				if len(c.capQueue) > 0 {
					nextCap = c.capQueue[0]
					c.capQueue = c.capQueue[1:]
					c.capInflight = true
				}
				c.mu.Unlock()

				if nextCap != "" {
					c.sendRaw("CAP REQ :" + nextCap)
				} else {
					// Nothing left — proceed
					if useSASL && c.hasAckedCap("sasl") {
						log.Printf("bnc[%s]: CAP negotiation complete (via NAK), sending AUTHENTICATE %s", c.net.ID, c.net.SASLMechanism)
						c.sendRaw("AUTHENTICATE " + c.net.SASLMechanism)
					} else {
						log.Printf("bnc[%s]: CAP negotiation complete (via NAK), sending CAP END", c.net.ID)
						c.sendRaw("CAP END")
					}
				}
			}
		}

	case "AUTHENTICATE":
		// Server is ready for our credentials (sent "AUTHENTICATE +")
		payload := ""
		if len(parts) > idx+1 {
			payload = strings.TrimPrefix(parts[idx+1], ":")
		}
		log.Printf("bnc[%s]: AUTHENTICATE payload=%q", c.net.ID, payload)
		if payload != "+" {
			break
		}
		mech := strings.ToUpper(c.net.SASLMechanism)
		switch mech {
		case "PLAIN":
			// PLAIN: base64("\x00username\x00password")
			raw := "\x00" + c.net.SASLUsername + "\x00" + c.net.SASLPassword
			encoded := base64.StdEncoding.EncodeToString([]byte(raw))
			log.Printf("bnc[%s]: sending AUTHENTICATE PLAIN credentials (username=%q)", c.net.ID, c.net.SASLUsername)
			c.sendRaw("AUTHENTICATE " + encoded)
		default:
			c.sendRaw("AUTHENTICATE *")
			log.Printf("bnc[%s]: unsupported SASL mechanism %q", c.net.ID, mech)
		}

	case "900": // RPL_LOGGEDIN
		c.mu.Lock()
		alreadyDone := c.saslDone
		c.saslDone = true
		c.mu.Unlock()
		if !alreadyDone {
			log.Printf("bnc[%s]: SASL logged in (900)", c.net.ID)
			c.notice("✓ SASL authentication successful")
			c.sendRaw("CAP END")
		}

	case "901": // RPL_LOGGEDOUT — shouldn't happen during connect
		break

	case "902", "903", "904", "905", "906", "907":
		// 902 = ERR_NICKLOCKED, 903 = RPL_SASLSUCCESS, 904 = ERR_SASLFAIL
		// 905 = ERR_SASLTOOLONG, 906 = ERR_SASLABORTED, 907 = ERR_SASLALREADY
		if cmd == "903" {
			c.mu.Lock()
			alreadyDone := c.saslDone
			c.saslDone = true
			c.mu.Unlock()
			if !alreadyDone {
				// Some servers send 903 without 900
				log.Printf("bnc[%s]: SASL success (903)", c.net.ID)
				c.notice("✓ SASL authentication successful")
				c.sendRaw("CAP END")
			} else {
				log.Printf("bnc[%s]: SASL 903 received (CAP END already sent via 900)", c.net.ID)
			}
		} else {
			msg := ""
			if len(parts) > idx+1 {
				msg = parts[len(parts)-1]
				msg = strings.TrimPrefix(msg, ":")
			}
			log.Printf("bnc[%s]: SASL error %s: %s", c.net.ID, cmd, msg)
			c.notice(fmt.Sprintf("⚠ SASL failed (%s): %s — connected without authentication", cmd, msg))
			c.sendRaw("CAP END")
		}

	case "001":
		// Registration complete
		nick := ""
		if len(parts) > idx+1 {
			nick = parts[idx+1]
		}
		c.mu.Lock()
		c.currentNick = nick
		c.connected = true
		c.backoff = initialBackoff // reset backoff on successful connect
		c.retryCount = 0           // reset retry counter
		// Snapshot dynamic channels joined before this reconnect
		prevChans := make([]string, 0, len(c.joinedChans))
		for ch := range c.joinedChans {
			prevChans = append(prevChans, ch)
		}
		c.joinedChans = make(map[string]bool) // reset; will repopulate on JOIN
		c.mu.Unlock()

		c.store.SetStatus(c.net.ID, networks.StatusConnected, "")
		log.Printf("bnc[%s]: registered on %s as %s", c.net.ID, c.net.Name, nick)

		// Execute OnConnect perform commands, then rejoin all channels.
		// Small initial delay lets the server finish its welcome burst.
		go func() {
			log.Printf("bnc[%s]: auto-join goroutine started, sleeping 500ms", c.net.ID)
			time.Sleep(500 * time.Millisecond)

			// Run perform commands (slash commands like /msg, /oper, etc.)
			c.mu.Lock()
			cmds := make([]string, len(c.net.OnConnect))
			copy(cmds, c.net.OnConnect)
			currentNick := c.currentNick
			c.mu.Unlock()

			for _, cmd := range cmds {
				cmd = strings.TrimSpace(cmd)
				if cmd == "" {
					continue
				}
				raw := performToRaw(cmd, currentNick)
				if raw == "" {
					log.Printf("bnc[%s]: perform: skipping unrecognised command: %q", c.net.ID, cmd)
					continue
				}
				c.sendRaw(raw)
				log.Printf("bnc[%s]: perform: %s", c.net.ID, raw)
			}

			// Brief pause after perform commands before joining channels,
			// giving NickServ/ChanServ time to process authentication.
			if len(cmds) > 0 {
				time.Sleep(800 * time.Millisecond)
			}

			// Build deduplicated join list: configured auto-join + previously
			// joined dynamic channels (e.g. from /join during a prior session).
			seen := make(map[string]bool)
			var chans []string
			addChan := func(ch string) {
				ch = strings.TrimSpace(ch)
				if ch == "" {
					return
				}
				if !strings.HasPrefix(ch, "#") {
					ch = "#" + ch
				}
				if !seen[ch] {
					seen[ch] = true
					chans = append(chans, ch)
				}
			}
			c.mu.Lock()
			for _, ch := range c.net.AutoJoin {
				addChan(ch)
			}
			c.mu.Unlock()
			for _, ch := range prevChans {
				addChan(ch)
			}

			log.Printf("bnc[%s]: joining %d channel(s): %v", c.net.ID, len(chans), chans)
			for _, ch := range chans {
				c.sendRaw("JOIN " + ch)
			}
		}()

	case "433":
		// ERR_NICKNAMEINUSE
		c.mu.Lock()
		c.nickRetries++
		retries := c.nickRetries
		altNick := c.net.AltNick
		baseNick := c.net.Nick
		c.mu.Unlock()

		var next string
		if retries == 1 && altNick != "" {
			next = altNick
		} else {
			next = baseNick + strings.Repeat("_", retries)
		}
		c.mu.Lock()
		c.currentNick = next
		c.mu.Unlock()
		c.sendRaw("NICK " + next)

	case "NICK":
		// Track our own nick changes
		from := ""
		if strings.HasPrefix(parts[0], ":") {
			raw := parts[0][1:]
			if i := strings.Index(raw, "!"); i >= 0 {
				from = raw[:i]
			} else {
				from = raw
			}
		}
		c.mu.Lock()
		if from == c.currentNick && len(parts) > idx+1 {
			c.currentNick = strings.TrimPrefix(parts[idx+1], ":")
		}
		c.mu.Unlock()

	case "JOIN":
		from := nickFrom(parts[0])
		c.mu.Lock()
		me := c.currentNick
		c.mu.Unlock()
		if from == me && len(parts) > idx {
			ch := strings.TrimPrefix(parts[idx+1], ":")
			c.mu.Lock()
			c.joinedChans[ch] = true
			c.mu.Unlock()
			// Request server-side scrollback if chathistory is negotiated
			go func() {
				// Small delay to let the server finish sending its JOIN burst (353, 366, etc.)
				time.Sleep(300 * time.Millisecond)
				c.requestHistory(ch)
			}()
		}

	case "PART", "KICK":
		// Track channel membership for reconnect rejoining
		from := nickFrom(parts[0])
		c.mu.Lock()
		me := c.currentNick
		c.mu.Unlock()
		var ch string
		if len(parts) > idx {
			ch = parts[idx+1]
		}
		if cmd == "KICK" && len(parts) > idx+1 {
			// KICK #chan nick :reason — parts[idx+2] is the target
			if len(parts) > idx+2 {
				target := parts[idx+2]
				if target == me {
					c.mu.Lock()
					delete(c.joinedChans, ch)
					c.mu.Unlock()
				}
			}
		} else if from == me {
			c.mu.Lock()
			delete(c.joinedChans, ch)
			c.mu.Unlock()
		}

	case "471", "473", "474", "475", "477", "485":
		// JOIN error numerics — log them so we can diagnose auto-join failures
		// 471=channel full, 473=invite only, 474=banned, 475=key required
		// 477=need registered nick, 485=cannot join (unaffiliated)
		errChan := ""
		if len(parts) > idx+2 {
			errChan = parts[idx+2]
		}
		errMsg := ""
		if len(parts) > idx+3 {
			errMsg = strings.TrimPrefix(parts[len(parts)-1], ":")
		}
		log.Printf("bnc[%s]: JOIN error %s for %s: %s", c.net.ID, cmd, errChan, errMsg)

	case "ERROR":
		log.Printf("bnc[%s]: server ERROR: %s", c.net.ID, line)
		c.store.SetStatus(c.net.ID, networks.StatusError, line)
	}
}

// buffer stores a line in the appropriate ring buffer.
// Channel messages go to the channel buffer; everything else to __server__.
func (c *Conn) buffer(line string) {
	// Determine target channel (if any) from the line
	// PRIVMSG/NOTICE/JOIN/PART/KICK/TOPIC lines have a channel target
	chan_ := channelFromLine(line)

	// Stamp @time tag if not already present so replayed lines have correct timestamps.
	hasTime := strings.HasPrefix(line, "@") && strings.Contains(strings.SplitN(line+" ", " ", 2)[0], "time=")
	if !hasTime {
		ts := "@time=" + time.Now().UTC().Format(time.RFC3339Nano)
		if strings.HasPrefix(line, "@") {
			// Already has tags but no time — append time to existing tag block
			line = line[:1] + "time=" + time.Now().UTC().Format(time.RFC3339Nano) + ";" + line[1:]
		} else {
			line = ts + " " + line
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	key := "__server__"
	if chan_ != "" {
		key = chan_
	}
	if c.buffers[key] == nil {
		c.buffers[key] = newRingBuffer(BufferSize)
	}
	c.buffers[key].Push(line)
}

// fanOut sends a line to all current subscribers.
func (c *Conn) fanOut(line string) {
	c.mu.Lock()
	subs := make([]*subscriber, 0, len(c.subs))
	for _, s := range c.subs {
		subs = append(subs, s)
	}
	c.mu.Unlock()

	for _, s := range subs {
		s.send(line)
	}
}

func (c *Conn) sendRaw(line string) {
	c.mu.Lock()
	tc := c.tcpConn
	c.mu.Unlock()
	if tc == nil {
		return
	}
	// Raw send log — redact AUTHENTICATE credentials and PASS/OPER passwords
	if c.ircDebug {
		logLine := line
		upper := strings.ToUpper(line)
		switch {
		case strings.HasPrefix(upper, "AUTHENTICATE ") && line != "AUTHENTICATE PLAIN" && line != "AUTHENTICATE *":
			logLine = "AUTHENTICATE <redacted>"
		case strings.HasPrefix(upper, "PASS "):
			logLine = "PASS <redacted>"
		}
		log.Printf("bnc[%s] → %s", c.net.ID, logLine)
	}
	tc.SetWriteDeadline(time.Now().Add(writeTimeout))
	fmt.Fprintf(tc, "%s\r\n", line)
}

func (c *Conn) notice(text string) {
	line := fmt.Sprintf(":*bnc* NOTICE * :%s", text)
	// BNC meta-notices (connection state, errors) are sent live only — not buffered.
	// Buffering them causes them to replay on every new browser tab as fake
	// "reconnecting"/"connecting" messages even when already connected.
	c.fanOut(line)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// isSelfMembershipLine returns true for JOIN and MODE lines where the acting
// nick is the BNC's current nick. These are suppressed during ring buffer
// replay because they're artifacts of the BNC's own session, not real events.
func isSelfMembershipLine(line, selfNick string) bool {
	if selfNick == "" {
		return false
	}
	// Strip IRCv3 tags
	if strings.HasPrefix(line, "@") {
		sp := strings.Index(line, " ")
		if sp < 0 {
			return false
		}
		line = line[sp+1:]
	}
	parts := strings.SplitN(line, " ", 4)
	if len(parts) < 2 {
		return false
	}
	// Extract nick from prefix (:nick!user@host)
	prefix := ""
	idx := 0
	if strings.HasPrefix(parts[0], ":") {
		prefix = strings.TrimPrefix(parts[0], ":")
		idx = 1
	}
	if idx >= len(parts) {
		return false
	}
	cmd := strings.ToUpper(parts[idx])
	if cmd != "JOIN" && cmd != "MODE" {
		return false
	}
	nick := prefix
	if i := strings.Index(prefix, "!"); i >= 0 {
		nick = prefix[:i]
	}
	return strings.EqualFold(nick, selfNick)
}

func nickFrom(prefix string) string {
	s := strings.TrimPrefix(prefix, ":")
	if i := strings.Index(s, "!"); i >= 0 {
		return s[:i]
	}
	return s
}

// channelFromLine returns the channel name for lines that target a channel,
// or "" for server/global messages.
func channelFromLine(line string) string {
	// Strip IRCv3 message tags
	if strings.HasPrefix(line, "@") {
		if sp := strings.Index(line, " "); sp >= 0 {
			line = strings.TrimLeft(line[sp+1:], " ")
		} else {
			return ""
		}
	}

	// Fast path: skip lines without a channel prefix in the target
	parts := strings.SplitN(line, " ", 4)
	if len(parts) < 3 {
		return ""
	}

	// Strip message prefix
	idx := 0
	if strings.HasPrefix(parts[0], ":") {
		idx = 1
	}
	if len(parts) <= idx+1 {
		return ""
	}

	cmd := strings.ToUpper(parts[idx])
	target := parts[idx+1]

	switch cmd {
	case "PRIVMSG", "NOTICE", "TOPIC":
		target = strings.TrimPrefix(target, ":")
		if strings.HasPrefix(target, "#") || strings.HasPrefix(target, "&") {
			return target
		}
	case "JOIN":
		ch := strings.TrimPrefix(parts[idx+1], ":")
		if strings.HasPrefix(ch, "#") || strings.HasPrefix(ch, "&") {
			return ch
		}
	case "PART", "KICK":
		if strings.HasPrefix(target, "#") || strings.HasPrefix(target, "&") {
			return target
		}
	case "353": // RPL_NAMREPLY — parts are: me = * #channel :nicks
		// :server 353 me = #channel :nicks
		// After stripping prefix (idx=1): cmd=353, target=me, parts[idx+2]= = or * or @, parts[idx+3]=#chan ...
		// Need a deeper parse
		if len(parts) >= 4 {
			sub := strings.SplitN(parts[3], " ", 3)
			if len(sub) >= 2 && (strings.HasPrefix(sub[1], "#") || strings.HasPrefix(sub[1], "&")) {
				return sub[1]
			}
		}
	case "366": // RPL_ENDOFNAMES — :server 366 me #channel :End of /NAMES list
		// target is the nick (parts[idx+1]), channel is parts[idx+2]
		if len(parts) >= 4 {
			ch := strings.SplitN(parts[3], " ", 2)[0]
			if strings.HasPrefix(ch, "#") || strings.HasPrefix(ch, "&") {
				return ch
			}
		}
	}
	return ""
}

// hasAckedCap returns true if the server acknowledged the given capability.
func (c *Conn) hasAckedCap(cap string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ackedCaps[strings.ToLower(cap)]
}

// requestHistory sends a CHATHISTORY LATEST command for the given channel,
// using whichever history capability the server supports.
// Called after joining a channel.
func (c *Conn) requestHistory(ch string) {
	hasCH   := c.hasAckedCap("chathistory")
	hasDraft := c.hasAckedCap("draft/chathistory")
	if !hasCH && !hasDraft {
		return // server doesn't support chathistory
	}
	// CHATHISTORY LATEST <target> * <limit>
	// "* " means "from the newest message going back"
	c.sendRaw(fmt.Sprintf("CHATHISTORY LATEST %s * 100", ch))
	log.Printf("bnc[%s]: requested chathistory for %s", c.net.ID, ch)
}



// performToRaw translates a user-facing slash command (as stored in OnConnect)
// into a raw IRC protocol line ready to send upstream.
// nick is the current nick at connection time (used for /mode nick etc.)
// Returns "" if the command is unrecognised or malformed.
func performToRaw(cmd, nick string) string {
	if !strings.HasPrefix(cmd, "/") {
		// Already a raw command (e.g. "PRIVMSG NickServ :IDENTIFY pass") — send as-is
		return cmd
	}

	// Split into command word and remainder
	rest := ""
	word := cmd[1:] // strip leading /
	if i := strings.Index(word, " "); i >= 0 {
		rest = strings.TrimSpace(word[i+1:])
		word = word[:i]
	}
	word = strings.ToLower(word)
	args := strings.Fields(rest)

	arg := func(n int) string {
		if n < len(args) {
			return args[n]
		}
		return ""
	}
	argRest := func(from int) string {
		if from >= len(args) {
			return ""
		}
		return strings.Join(args[from:], " ")
	}

	switch word {
	case "msg", "query":
		// /msg <nick> <text>  →  PRIVMSG <nick> :<text>
		tgt := arg(0)
		text := argRest(1)
		if tgt == "" || text == "" {
			return ""
		}
		return fmt.Sprintf("PRIVMSG %s :%s", tgt, text)

	case "notice":
		// /notice <nick|#chan> <text>  →  NOTICE <target> :<text>
		tgt := arg(0)
		text := argRest(1)
		if tgt == "" || text == "" {
			return ""
		}
		return fmt.Sprintf("NOTICE %s :%s", tgt, text)

	case "nick":
		// /nick <newnick>  →  NICK <newnick>
		if rest == "" {
			return ""
		}
		return "NICK " + rest

	case "oper":
		// /oper <name> <password>  →  OPER <name> <password>
		name := arg(0)
		pass := argRest(1)
		if name == "" || pass == "" {
			return ""
		}
		return fmt.Sprintf("OPER %s %s", name, pass)

	case "mode":
		// /mode [target] [flags...]  →  MODE <target> [flags...]
		if rest == "" {
			// Default: set mode on self
			return "MODE " + nick
		}
		return "MODE " + rest

	case "join":
		// /join #channel  →  JOIN #channel
		ch := arg(0)
		if ch == "" {
			return ""
		}
		if !strings.HasPrefix(ch, "#") && !strings.HasPrefix(ch, "&") {
			ch = "#" + ch
		}
		if key := arg(1); key != "" {
			return fmt.Sprintf("JOIN %s %s", ch, key)
		}
		return "JOIN " + ch

	case "part", "leave":
		// /part #channel [reason]  →  PART #channel :reason
		ch := arg(0)
		if ch == "" {
			return ""
		}
		reason := argRest(1)
		if reason == "" {
			reason = "Leaving"
		}
		return fmt.Sprintf("PART %s :%s", ch, reason)

	case "away":
		// /away [message]  →  AWAY [:message]
		if rest == "" {
			return "AWAY"
		}
		return "AWAY :" + rest

	case "back":
		return "AWAY"

	case "topic":
		// /topic #channel [new topic]  →  TOPIC #channel [:new topic]
		ch := arg(0)
		if ch == "" {
			return ""
		}
		text := argRest(1)
		if text != "" {
			return fmt.Sprintf("TOPIC %s :%s", ch, text)
		}
		return "TOPIC " + ch

	case "invite":
		// /invite <nick> <#channel>  →  INVITE <nick> <#channel>
		target := arg(0)
		ch := arg(1)
		if target == "" || ch == "" {
			return ""
		}
		return fmt.Sprintf("INVITE %s %s", target, ch)

	case "kick":
		// /kick #channel <nick> [reason]  →  KICK #channel <nick> :<reason>
		ch := arg(0)
		target := arg(1)
		if ch == "" || target == "" {
			return ""
		}
		reason := argRest(2)
		if reason == "" {
			reason = "Kicked"
		}
		return fmt.Sprintf("KICK %s %s :%s", ch, target, reason)

	case "ban":
		// /ban #channel <mask>  →  MODE #channel +b <mask>
		ch := arg(0)
		mask := arg(1)
		if ch == "" || mask == "" {
			return ""
		}
		return fmt.Sprintf("MODE %s +b %s", ch, mask)

	case "unban":
		ch := arg(0)
		mask := arg(1)
		if ch == "" || mask == "" {
			return ""
		}
		return fmt.Sprintf("MODE %s -b %s", ch, mask)

	case "whois":
		if rest == "" {
			return ""
		}
		return "WHOIS " + rest

	case "who":
		if rest == "" {
			return ""
		}
		return "WHO " + rest

	case "names":
		if rest == "" {
			return ""
		}
		return "NAMES " + rest

	case "list":
		if rest == "" {
			return "LIST"
		}
		return "LIST " + rest

	case "quote", "raw":
		// /quote <raw IRC>  — pass remainder directly
		return rest

	case "umode":
		// /umode <flags>  →  MODE <nick> <flags>
		if rest == "" {
			return ""
		}
		return fmt.Sprintf("MODE %s %s", nick, rest)

	default:
		return ""
	}
}
