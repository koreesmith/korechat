package bnc

import (
	"fmt"
	"log"
	"runtime"
	"sync"

	"github.com/koree/korechat/internal/networks"
)

// Manager owns all persistent BNC connections.
// One Manager exists for the lifetime of the server process.
type Manager struct {
	store *networks.Store
	logFn LogFunc // may be nil

	mu    sync.RWMutex
	conns map[string]*Conn // networkID → Conn
}

// NewManager creates a Manager.
func NewManager(store *networks.Store) *Manager {
	return &Manager{
		store: store,
		conns: make(map[string]*Conn),
	}
}

// SetLogFunc attaches a logging callback. Call before Start().
func (m *Manager) SetLogFunc(fn LogFunc) {
	m.logFn = fn
}

// Start connects to all provided networks.
// Call once at server startup with networks loaded from the DB.
func (m *Manager) Start(nets []*networks.Network) {
	for _, n := range nets {
		// Seed the in-memory status store so NetworkStatus works
		m.store.SetStatus(n.ID, networks.StatusDisconnected, "")
		m.startConn(n)
	}
	log.Printf("bnc: manager started, connecting to %d network(s)", len(nets))
}

// AddNetwork creates and starts a persistent connection for a newly added network.
func (m *Manager) AddNetwork(n *networks.Network) {
	m.store.SetStatus(n.ID, networks.StatusDisconnected, "")
	m.startConn(n)
}

// RestartNetwork stops the current connection and starts a fresh one with
// updated config. Call this after persisting network setting changes.
func (m *Manager) RestartNetwork(n *networks.Network) {
	m.store.SetStatus(n.ID, networks.StatusDisconnected, "")
	m.startConn(n) // startConn stops any existing conn before starting the new one
	log.Printf("bnc: restarted connection for network %s (%s)", n.Name, n.Addr())
}

// RemoveNetwork tears down the connection for a deleted network.
func (m *Manager) RemoveNetwork(networkID string) {
	m.mu.Lock()
	c, ok := m.conns[networkID]
	if ok {
		delete(m.conns, networkID)
	}
	m.mu.Unlock()

	if ok {
		c.Stop()
		log.Printf("bnc: stopped connection for network %s", networkID)
	}
}

// DisconnectNetwork stops the upstream IRC connection without deleting the
// network. The Conn is removed so ReconnectNetwork can start a fresh one.
func (m *Manager) DisconnectNetwork(networkID string) {
	m.mu.Lock()
	c, ok := m.conns[networkID]
	if ok {
		delete(m.conns, networkID)
	}
	m.mu.Unlock()

	if ok {
		c.Stop()
		m.store.SetStatus(networkID, networks.StatusDisconnected, "")
		log.Printf("bnc: disconnected network %s (manual)", networkID)
	}
}

// ReconnectNetwork starts a fresh connection for a network that was previously
// disconnected. Looks up the network from the store.
func (m *Manager) ReconnectNetwork(n *networks.Network) {
	// Log caller for debugging double-connect issues
	buf := make([]byte, 2048)
	buf = buf[:runtime.Stack(buf, false)]
	log.Printf("bnc: ReconnectNetwork called for %s — stack:\n%s", n.Name, buf)

	m.store.SetStatus(n.ID, networks.StatusDisconnected, "")
	m.startConn(n)
	log.Printf("bnc: reconnecting network %s (%s)", n.Name, n.Addr())
}

// Subscribe attaches a WS session to a network's persistent connection.
func (m *Manager) Subscribe(networkID, sessionID string, send SendFunc) error {
	m.mu.RLock()
	c, ok := m.conns[networkID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("no BNC connection for network %q", networkID)
	}
	c.Subscribe(sessionID, send)
	return nil
}

// Unsubscribe detaches a WS session. The upstream TCP stays alive.
func (m *Manager) Unsubscribe(networkID, sessionID string) {
	m.mu.RLock()
	c, ok := m.conns[networkID]
	m.mu.RUnlock()

	if ok {
		c.Unsubscribe(sessionID)
	}
}

// Send forwards a raw IRC line from a browser session to the upstream server.
func (m *Manager) Send(networkID, line string) {
	m.mu.RLock()
	c, ok := m.conns[networkID]
	m.mu.RUnlock()

	if ok {
		c.Send(line)
	}
}

// NetworkStatus returns the current connection status of a network.
func (m *Manager) NetworkStatus(networkID string) networks.Status {
	m.mu.RLock()
	_, ok := m.conns[networkID]
	m.mu.RUnlock()
	if !ok {
		return networks.StatusDisconnected
	}
	return m.store.StatusOf(networkID)
}

// ConnectedNick returns the nick currently in use on a network, or "".
func (m *Manager) ConnectedNick(networkID string) string {
	m.mu.RLock()
	c, ok := m.conns[networkID]
	m.mu.RUnlock()
	if !ok {
		return ""
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.currentNick
}

// Shutdown stops all persistent connections gracefully.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	conns := make([]*Conn, 0, len(m.conns))
	for _, c := range m.conns {
		conns = append(conns, c)
	}
	m.mu.Unlock()

	for _, c := range conns {
		c.Stop()
	}
	log.Printf("bnc: all connections stopped")
}

// ─── Internal ─────────────────────────────────────────────────────────────────

func (m *Manager) startConn(n *networks.Network) {
	c := newConn(n, m.store, m, m.logFn)

	m.mu.Lock()
	if old, ok := m.conns[n.ID]; ok {
		old.Stop()
	}
	m.conns[n.ID] = c
	m.mu.Unlock()

	c.Start()
	log.Printf("bnc: started connection for network %s (%s)", n.Name, n.Addr())
}
