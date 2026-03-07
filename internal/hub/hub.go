// Package hub manages the central state of the IRC server: all users,
// channels, and message routing between WebSocket clients.
package hub

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/koree/korechat/internal/models"
	"github.com/koree/korechat/pkg/ircv3"
)

// SendFunc is how the hub delivers formatted messages back to a specific client.
type SendFunc func(msg *ircv3.Message)

// Client represents a connected session registered in the hub.
type Client struct {
	ID   string // unique session ID
	User *models.User
	Send SendFunc
}

// Hub is the central broker.
type Hub struct {
	mu       sync.RWMutex
	cfg      HubConfig
	clients  map[string]*Client          // session ID → Client
	nicks    map[string]*Client          // lowercase nick → Client
	channels map[string]*models.Channel  // lowercase name → Channel
}

type HubConfig struct {
	ServerName string
	ServerVer  string
	MOTD       string
}

func New(cfg HubConfig) *Hub {
	return &Hub{
		cfg:      cfg,
		clients:  make(map[string]*Client),
		nicks:    make(map[string]*Client),
		channels: make(map[string]*models.Channel),
	}
}

// ─── Registration ─────────────────────────────────────────────────────────────

func (h *Hub) Register(id string, u *models.User, send SendFunc) *Client {
	h.mu.Lock()
	defer h.mu.Unlock()
	c := &Client{ID: id, User: u, Send: send}
	h.clients[id] = c
	return c
}

func (h *Hub) Unregister(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c, ok := h.clients[id]
	if !ok {
		return
	}
	if c.User.Nick != "" {
		delete(h.nicks, strings.ToLower(c.User.Nick))
	}
	delete(h.clients, id)
}

// ─── Nick management ──────────────────────────────────────────────────────────

func (h *Hub) NickInUse(nick string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.nicks[strings.ToLower(nick)]
	return ok
}

func (h *Hub) SetNick(c *Client, newNick string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.User.Nick != "" {
		delete(h.nicks, strings.ToLower(c.User.Nick))
	}
	c.User.Nick = newNick
	c.User.NickSet = true
	h.nicks[strings.ToLower(newNick)] = c
}

func (h *Hub) ClientByNick(nick string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.nicks[strings.ToLower(nick)]
	return c, ok
}

// ─── Channel management ───────────────────────────────────────────────────────

func (h *Hub) GetOrCreateChannel(name string) *models.Channel {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := strings.ToLower(name)
	if ch, ok := h.channels[key]; ok {
		return ch
	}
	ch := models.NewChannel(name)
	h.channels[key] = ch
	log.Printf("hub: created channel %s", name)
	return ch
}

func (h *Hub) GetChannel(name string) (*models.Channel, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ch, ok := h.channels[strings.ToLower(name)]
	return ch, ok
}

func (h *Hub) ChannelList() []*models.Channel {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*models.Channel, 0, len(h.channels))
	for _, ch := range h.channels {
		out = append(out, ch)
	}
	return out
}

// ─── Message delivery ─────────────────────────────────────────────────────────

// BroadcastChannel sends a message to all members of a channel.
// If exceptID is non-empty, that client is skipped (used for PRIVMSG echo suppression
// unless the client has echo-message cap).
func (h *Hub) BroadcastChannel(ch *models.Channel, msg *ircv3.Message, exceptID string) {
	members := ch.MemberList()
	for _, m := range members {
		cl, ok := h.ClientByNick(m.User.Nick)
		if !ok {
			continue
		}
		if cl.ID == exceptID {
			continue
		}
		cl.Send(msg)
	}
}

// BroadcastChannelTagged sends a message to channel members, with server-time
// and msgid tags attached. Sender gets echo-message copy if they have the cap.
func (h *Hub) BroadcastChannelTagged(ch *models.Channel, msg *ircv3.Message, senderID string) {
	tagged := ircv3.WithServerTime(msg)
	if _, hasMsgid := tagged.Tags["msgid"]; !hasMsgid {
		tagged.Tags["msgid"] = newMsgID()
	}

	members := ch.MemberList()
	for _, m := range members {
		cl, ok := h.ClientByNick(m.User.Nick)
		if !ok {
			continue
		}
		if cl.ID == senderID && !cl.User.HasCap("echo-message") {
			continue
		}
		cl.Send(tagged)
	}
}

// SendToClient sends a message directly to one client.
func (h *Hub) SendToClient(c *Client, msg *ircv3.Message) {
	c.Send(ircv3.WithServerTime(msg))
}

// ─── Welcome sequence ─────────────────────────────────────────────────────────

func (h *Hub) SendWelcome(c *Client) {
	srv := h.cfg.ServerName
	nick := c.User.Nick
	now := time.Now().UTC().Format("Mon Jan 02 2006 at 15:04:05 UTC")

	seq := []*ircv3.Message{
		ircv3.FromServer(srv, "001", nick, "Welcome to the KoreChat IRC Network "+c.User.Prefix()),
		ircv3.FromServer(srv, "002", nick, fmt.Sprintf("Your host is %s, running %s", srv, h.cfg.ServerVer)),
		ircv3.FromServer(srv, "003", nick, "This server was created "+now),
		ircv3.FromServer(srv, "004", nick, srv, h.cfg.ServerVer, "iowghraAsORTVSx", "lvhopsmntikaqrRcybeDzFI"),
		ircv3.FromServer(srv, "005", nick,
			"CHANTYPES=#",
			"EXCEPTS", "INVEX",
			"CHANMODES=eIbq,k,flj,CFLMPQScgimnprstz",
			"CHANLIMIT=#:120",
			"PREFIX=(qaohv)~&@%+",
			"MAXCHANNELS=50",
			"NICKLEN=30",
			"TOPICLEN=390",
			"are supported by this server",
		),
		ircv3.FromServer(srv, "375", nick, fmt.Sprintf("- %s Message of the Day -", srv)),
		ircv3.FromServer(srv, "372", nick, "- "+h.cfg.MOTD),
		ircv3.FromServer(srv, "376", nick, "End of /MOTD command."),
	}

	for _, m := range seq {
		c.Send(ircv3.WithServerTime(m))
	}

	log.Printf("hub: welcomed %s", nick)
}

// ─── JOIN helpers ─────────────────────────────────────────────────────────────

func (h *Hub) SendJoinBurst(c *Client, ch *models.Channel) {
	srv := h.cfg.ServerName
	nick := c.User.Nick

	// Topic
	if ch.Topic != "" {
		c.Send(ircv3.WithServerTime(ircv3.FromServer(srv, "332", nick, ch.Name, ch.Topic)))
		c.Send(ircv3.WithServerTime(ircv3.FromServer(srv, "333", nick, ch.Name, ch.TopicBy, fmt.Sprintf("%d", ch.TopicAt.Unix()))))
	}

	// NAMES — split into 400-char chunks
	var names []string
	for _, m := range ch.MemberList() {
		prefix := ""
		if c.User.HasCap("multi-prefix") {
			prefix = m.Prefix
		} else if len(m.Prefix) > 0 {
			prefix = string(m.Prefix[0])
		}
		names = append(names, prefix+m.User.Nick)
	}

	const chunkMax = 400
	var chunk []string
	chunkLen := 0
	flush := func() {
		if len(chunk) == 0 {
			return
		}
		c.Send(ircv3.WithServerTime(ircv3.FromServer(srv, "353", nick, "=", ch.Name, strings.Join(chunk, " "))))
		chunk = nil
		chunkLen = 0
	}
	for _, n := range names {
		if chunkLen+len(n)+1 > chunkMax {
			flush()
		}
		chunk = append(chunk, n)
		chunkLen += len(n) + 1
	}
	flush()
	c.Send(ircv3.WithServerTime(ircv3.FromServer(srv, "366", nick, ch.Name, "End of /NAMES list")))
}

func (h *Hub) SendChannelHistory(c *Client, ch *models.Channel, limit int) {
	if !c.User.HasCap("draft/chathistory") {
		return
	}
	entries := ch.GetHistory(time.Now().Add(time.Hour), limit)
	for _, e := range entries {
		msg := &ircv3.Message{
			Tags:    e.Tags,
			Prefix:  e.Prefix,
			Command: e.Command,
			Params:  e.Params,
		}
		c.Send(msg)
	}
}

// ─── Utility ──────────────────────────────────────────────────────────────────

var msgCounter uint64
var msgMu sync.Mutex

func newMsgID() string {
	msgMu.Lock()
	defer msgMu.Unlock()
	msgCounter++
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), msgCounter)
}
