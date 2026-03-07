// Package networks manages IRC network configurations.
// A Network is a named IRC server the user can connect to (e.g. Libera.Chat).
// Networks are stored in-memory for now; persistence can be added later via Postgres.
package networks

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Status represents the connection state of a network.
type Status string

const (
	StatusDisconnected Status = "disconnected"
	StatusConnecting   Status = "connecting"
	StatusConnected    Status = "connected"
	StatusError        Status = "error"
)

// Network holds configuration and runtime state for a single IRC network.
type Network struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"` // owner; populated from DB, not persisted separately
	Name   string `json:"name"`    // display name, e.g. "Libera.Chat"

	// Connection settings
	Host     string `json:"host"`     // e.g. irc.libera.chat
	Port     int    `json:"port"`     // e.g. 6667
	TLS      bool   `json:"tls"`      // phase 2
	Password string `json:"password"` // server password (PASS command), optional

	// Identity
	Nick     string `json:"nick"`
	AltNick  string `json:"alt_nick"`  // fallback if Nick is taken
	Username string `json:"username"`
	Realname string `json:"realname"`

	// Auto-join channels on connect (comma-separated or slice)
	AutoJoin []string `json:"auto_join"`

	// OnConnect commands executed after welcome (001), before auto-join.
	// Each entry is a raw IRC command or a /slash command.
	// Examples: "PRIVMSG NickServ :IDENTIFY mypass", "/oper admin pass"
	OnConnect []string `json:"on_connect"`

	// SASL authentication (optional)
	// Mechanism is "" (disabled), "PLAIN", or "EXTERNAL"
	SASLMechanism string `json:"sasl_mechanism"`
	SASLUsername  string `json:"sasl_username"`
	SASLPassword  string `json:"sasl_password"`

	// Runtime state (not persisted)
	Status    Status    `json:"status"`
	StatusMsg string    `json:"status_msg,omitempty"`
	ConnectedAt *time.Time `json:"connected_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Addr returns "host:port".
func (n *Network) Addr() string {
	return fmt.Sprintf("%s:%d", n.Host, n.Port)
}

// Validate checks that the network config is valid.
func (n *Network) Validate() error {
	if strings.TrimSpace(n.Name) == "" {
		return errors.New("name is required")
	}
	if strings.TrimSpace(n.Host) == "" {
		return errors.New("host is required")
	}
	if n.Port <= 0 || n.Port > 65535 {
		return errors.New("port must be between 1 and 65535")
	}
	if strings.TrimSpace(n.Nick) == "" {
		return errors.New("nick is required")
	}
	return nil
}

// ─── Store ────────────────────────────────────────────────────────────────────

// Store is an in-memory registry of Networks.
type Store struct {
	mu       sync.RWMutex
	networks map[string]*Network
	seq      uint64
}

func NewStore() *Store {
	return &Store{networks: make(map[string]*Network)}
}

func (s *Store) nextID() string {
	s.seq++
	return fmt.Sprintf("net-%d", s.seq)
}

// Add creates a new network and returns it.
func (s *Store) Add(n *Network) *Network {
	s.mu.Lock()
	defer s.mu.Unlock()
	n.ID = s.nextID()
	n.Status = StatusDisconnected
	now := time.Now()
	n.CreatedAt = now
	n.UpdatedAt = now
	// Defaults
	if n.Port == 0 {
		n.Port = 6667
	}
	if n.Username == "" {
		n.Username = n.Nick
	}
	if n.Realname == "" {
		n.Realname = n.Nick
	}
	if n.AltNick == "" {
		n.AltNick = n.Nick + "_"
	}
	s.networks[n.ID] = n
	return n
}

// Get returns a network by ID.
func (s *Store) Get(id string) (*Network, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n, ok := s.networks[id]
	return n, ok
}

// List returns a copy of all networks.
func (s *Store) List() []*Network {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Network, 0, len(s.networks))
	for _, n := range s.networks {
		out = append(out, n)
	}
	return out
}

// Update replaces mutable fields on a network.
func (s *Store) Update(id string, patch *Network) (*Network, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.networks[id]
	if !ok {
		return nil, errors.New("network not found")
	}
	if patch.Name != "" {
		n.Name = patch.Name
	}
	if patch.Host != "" {
		n.Host = patch.Host
	}
	if patch.Port != 0 {
		n.Port = patch.Port
	}
	if patch.Nick != "" {
		n.Nick = patch.Nick
	}
	if patch.Username != "" {
		n.Username = patch.Username
	}
	if patch.Realname != "" {
		n.Realname = patch.Realname
	}
	if patch.Password != "" {
		n.Password = patch.Password
	}
	if patch.AltNick != "" {
		n.AltNick = patch.AltNick
	}
	if len(patch.AutoJoin) > 0 {
		n.AutoJoin = patch.AutoJoin
	}
	n.OnConnect = patch.OnConnect // always overwrite (empty slice = clear all)
	n.TLS = patch.TLS
	n.UpdatedAt = time.Now()
	return n, nil
}

// Delete removes a network.
func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.networks[id]; !ok {
		return false
	}
	delete(s.networks, id)
	return true
}

// StatusOf returns the current status of a network.
func (s *Store) StatusOf(id string) Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if n, ok := s.networks[id]; ok {
		return n.Status
	}
	return StatusDisconnected
}

// SetStatus updates the status of a network.
func (s *Store) SetStatus(id string, status Status, msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.networks[id]
	if !ok {
		return
	}
	n.Status = status
	n.StatusMsg = msg
	if status == StatusConnected {
		now := time.Now()
		n.ConnectedAt = &now
	} else if status == StatusDisconnected || status == StatusError {
		n.ConnectedAt = nil
	}
}
