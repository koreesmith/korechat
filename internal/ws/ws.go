// Package ws implements the WebSocket transport layer.
//
// Two modes are supported per-session, selected by query parameter:
//
//	/ws                     → built-in KoreChat hub (legacy)
//	/ws?network=<id>        → attach to persistent BNC connection
//
// In BNC mode the session is a subscriber on an existing Conn. When the
// browser disconnects the upstream TCP stays alive (true bouncer behaviour).
package ws

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/koree/korechat/internal/bnc"
	"github.com/koree/korechat/internal/hub"
	"github.com/koree/korechat/internal/irc"
	"github.com/koree/korechat/internal/models"
	"github.com/koree/korechat/pkg/ircv3"
)

const (
	writeWait      = 10 * time.Second
	// pongWait must be long enough to survive browser tab suspension.
	// Browsers throttle backgrounded tabs and may delay pong responses
	// by minutes. We rely on application-level keepalives instead of
	// WS ping/pong for liveness detection.
	pongWait       = 24 * time.Hour
	pingPeriod     = 50 * time.Second
	maxMessageSize = 8192
	sendBufSize    = 8192 // must absorb full ring buffer replay (500 lines × N channels)
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Server handles incoming WebSocket upgrade requests.
type Server struct {
	hub        *hub.Hub
	bncMgr     *bnc.Manager
	serverName string
	mu         sync.Mutex
	sessionSeq uint64
}

func NewServer(h *hub.Hub, bm *bnc.Manager, serverName string) *Server {
	return &Server{hub: h, bncMgr: bm, serverName: serverName}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	s.sessionSeq++
	sessionID := fmt.Sprintf("sess-%d", s.sessionSeq)
	s.mu.Unlock()

	networkID := r.URL.Query().Get("network")
	if networkID != "" {
		go s.runBNCSession(conn, sessionID, networkID, r)
	} else {
		go s.runHubSession(conn, sessionID, r)
	}
}

// ─── Hub session ─────────────────────────────────────────────────────────────

type hubSession struct {
	id      string
	conn    *websocket.Conn
	sendCh  chan string
	client  *hub.Client
	handler *irc.Handler
}

func (s *Server) runHubSession(conn *websocket.Conn, id string, r *http.Request) {
	host := remoteHost(r)
	u := models.NewUser(host)

	sendCh := make(chan string, sendBufSize)
	sendFn := func(msg *ircv3.Message) {
		line := ircv3.Format(msg)
		select {
		case sendCh <- line:
		default:
			log.Printf("ws/hub: [%s] send buffer full, dropping", id)
		}
	}

	client := s.hub.Register(id, u, sendFn)
	sess := &hubSession{id: id, conn: conn, sendCh: sendCh, client: client}
	sess.handler = irc.NewHandler(s.hub, client, s.serverName)
	log.Printf("ws/hub: new session %s from %s", id, host)

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); sess.writePump() }()
	go func() { defer wg.Done(); sess.readPump() }()
	wg.Wait()

	sess.handler.BroadcastQuit("Connection closed")
	close(sendCh)
	log.Printf("ws/hub: session %s closed", id)
}

func (s *hubSession) readPump() {
	defer s.conn.Close()
	s.conn.SetReadLimit(maxMessageSize)
	s.conn.SetReadDeadline(time.Now().Add(pongWait))
	s.conn.SetPongHandler(func(string) error {
		s.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, raw, err := s.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws/hub: [%s] read error: %v", s.id, err)
			}
			return
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimRight(line, "\r\n ")
			if line != "" {
				s.handler.Handle(ircv3.Parse(line))
			}
		}
	}
}

func (s *hubSession) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() { ticker.Stop(); s.conn.Close() }()
	for {
		select {
		case line, ok := <-s.sendCh:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				s.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := s.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			fmt.Fprintln(w, line)
			n := len(s.sendCh)
			for i := 0; i < n && i < 255; i++ {
				fmt.Fprintln(w, <-s.sendCh)
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := s.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ─── BNC session ─────────────────────────────────────────────────────────────
//
// A thin subscriber on a persistent bnc.Conn.
// When the browser closes, only the subscriber is removed; upstream stays alive.

type bncSession struct {
	id        string
	networkID string
	conn      *websocket.Conn
	sendCh    chan string
	mgr       *bnc.Manager
}

func (s *Server) runBNCSession(conn *websocket.Conn, id, networkID string, r *http.Request) {
	host := remoteHost(r)
	sendCh := make(chan string, sendBufSize)

	sendFn := func(line string) {
		select {
		case sendCh <- line:
		case <-time.After(5 * time.Second):
			// Client is not consuming fast enough — drop and log.
			// With writePump running before Subscribe this should rarely fire.
			log.Printf("ws/bnc: [%s] send timeout, dropping line", id)
		}
	}

	sess := &bncSession{id: id, networkID: networkID, conn: conn, sendCh: sendCh, mgr: s.bncMgr}

	// Start writePump BEFORE Subscribe so it is already draining sendCh
	// when Subscribe replays the ring buffer. If writePump starts after,
	// Subscribe floods sendCh synchronously and drops lines (including
	// replay-done) before writePump has a chance to drain anything.
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); sess.writePump() }()
	go func() {
		defer wg.Done()
		defer func() {
			s.bncMgr.Unsubscribe(networkID, id)
			close(sendCh)
		}()

		if err := s.bncMgr.Subscribe(networkID, id, sendFn); err != nil {
			log.Printf("ws/bnc: [%s] subscribe to %q failed: %v", id, networkID, err)
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, err.Error()))
			conn.Close()
			return
		}
		log.Printf("ws/bnc: session %s from %s → network %s", id, host, networkID)
		sess.readPump()
	}()
	wg.Wait()
	return // Unsubscribe/close handled above
	log.Printf("ws/bnc: session %s detached from %s (upstream stays connected)", id, networkID)
}

func (s *bncSession) readPump() {
	defer s.conn.Close()
	s.conn.SetReadLimit(maxMessageSize)
	s.conn.SetReadDeadline(time.Now().Add(pongWait))
	s.conn.SetPongHandler(func(string) error {
		s.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, raw, err := s.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws/bnc: [%s] read error: %v", s.id, err)
			}
			return
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimRight(line, "\r\n ")
			if line != "" {
				s.mgr.Send(s.networkID, line)
			}
		}
	}
}

func (s *bncSession) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() { ticker.Stop(); s.conn.Close() }()
	for {
		select {
		case line, ok := <-s.sendCh:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				s.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := s.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			fmt.Fprintln(w, line)
			// Batch drain — critical during ring buffer replay which can
			// send hundreds of lines at once. Drain as much as possible
			// in a single WebSocket frame to minimize round trips.
			n := len(s.sendCh)
			for i := 0; i < n; i++ {
				fmt.Fprintln(w, <-s.sendCh)
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := s.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func remoteHost(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.Split(fwd, ",")[0]
	}
	return r.RemoteAddr
}
