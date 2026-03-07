package models

import (
	"sync"
	"time"
)

// ─── Prefix modes ────────────────────────────────────────────────────────────

// Mode prefixes in descending privilege order.
const (
	ModeOwner    = "~" // q
	ModeAdmin    = "&" // a
	ModeOp       = "@" // o
	ModeHalfOp   = "%" // h
	ModeVoice    = "+" // v
	ModeNone     = ""
)

// ─── User ────────────────────────────────────────────────────────────────────

// User represents a connected IRC user session.
type User struct {
	mu sync.RWMutex

	Nick     string
	Username string
	Realname string
	Host     string // resolved or masked host

	Account  string // SASL account name, empty if not authenticated
	Away     string // away message; empty means not away
	Modes    map[string]bool

	// Capabilities negotiated with this client.
	Caps map[string]bool

	// Registration state
	NickSet  bool
	UserSet  bool
	CapPhase bool // true while CAP negotiation is in progress

	ConnectedAt time.Time
}

func NewUser(host string) *User {
	return &User{
		Host:        host,
		Modes:       make(map[string]bool),
		Caps:        make(map[string]bool),
		ConnectedAt: time.Now(),
	}
}

func (u *User) Prefix() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.Nick + "!" + u.Username + "@" + u.Host
}

func (u *User) IsRegistered() bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.NickSet && u.UserSet && !u.CapPhase
}

func (u *User) HasCap(cap string) bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.Caps[cap]
}

func (u *User) SetCap(cap string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.Caps[cap] = true
}

func (u *User) IsAway() bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.Away != ""
}

// ─── Member ──────────────────────────────────────────────────────────────────

// Member holds a user's membership in a channel.
type Member struct {
	User   *User
	Prefix string // highest privilege prefix: ~ & @ % +
}

func (m *Member) PrefixString() string {
	// multi-prefix: return all applicable prefixes
	return m.Prefix
}

// ─── Channel ─────────────────────────────────────────────────────────────────

// Channel represents an IRC channel.
type Channel struct {
	mu sync.RWMutex

	Name    string
	Topic   string
	TopicBy string
	TopicAt time.Time

	Modes   map[string]bool
	Key     string // channel key (+k)
	Limit   int    // user limit (+l), 0 = no limit

	Members map[string]*Member // keyed by lowercase nick

	// History for draft/chathistory support
	History []*HistoryEntry
	MaxHistory int
}

func NewChannel(name string) *Channel {
	return &Channel{
		Name:       name,
		Modes:      map[string]bool{"n": true, "t": true},
		Members:    make(map[string]*Member),
		MaxHistory: 500,
	}
}

func (c *Channel) AddMember(u *User, prefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Members[u.Nick] = &Member{User: u, Prefix: prefix}
}

func (c *Channel) RemoveMember(nick string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.Members, nick)
}

func (c *Channel) GetMember(nick string) (*Member, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	m, ok := c.Members[nick]
	return m, ok
}

func (c *Channel) MemberCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.Members)
}

// MemberList returns a snapshot of all members.
func (c *Channel) MemberList() []*Member {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]*Member, 0, len(c.Members))
	for _, m := range c.Members {
		out = append(out, m)
	}
	return out
}

func (c *Channel) HasMember(nick string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.Members[nick]
	return ok
}

func (c *Channel) ModeString() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	s := "+"
	for m := range c.Modes {
		if c.Modes[m] {
			s += m
		}
	}
	return s
}

// AppendHistory adds a message to channel history.
func (c *Channel) AppendHistory(e *HistoryEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.History = append(c.History, e)
	if len(c.History) > c.MaxHistory {
		c.History = c.History[len(c.History)-c.MaxHistory:]
	}
}

// GetHistory returns up to `limit` messages before `before`.
func (c *Channel) GetHistory(before time.Time, limit int) []*HistoryEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var out []*HistoryEntry
	for i := len(c.History) - 1; i >= 0 && len(out) < limit; i-- {
		if c.History[i].Time.Before(before) {
			out = append([]*HistoryEntry{c.History[i]}, out...)
		}
	}
	return out
}

// ─── History ─────────────────────────────────────────────────────────────────

type HistoryEntry struct {
	Time    time.Time
	MsgID   string
	Prefix  string
	Command string
	Params  []string
	Tags    map[string]string
}
