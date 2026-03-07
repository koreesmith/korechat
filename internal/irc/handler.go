// Package irc implements IRCv3 command dispatch for WebSocket-connected clients.
package irc

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/koree/korechat/internal/hub"
	"github.com/koree/korechat/internal/models"
	"github.com/koree/korechat/pkg/ircv3"
)

// Handler processes incoming IRC messages from a single client.
type Handler struct {
	hub    *hub.Hub
	client *hub.Client
	srv    string
}

func NewHandler(h *hub.Hub, c *hub.Client, serverName string) *Handler {
	return &Handler{hub: h, client: c, srv: serverName}
}

// Handle dispatches an incoming parsed message.
func (h *Handler) Handle(msg *ircv3.Message) {
	if msg.Command != "PING" && msg.Command != "PONG" {
		log.Printf("irc: [%s] → %s %v", h.client.User.Nick, msg.Command, msg.Params)
	}

	switch msg.Command {
	case "CAP":
		h.handleCAP(msg)
	case "NICK":
		h.handleNICK(msg)
	case "USER":
		h.handleUSER(msg)
	case "PING":
		h.handlePING(msg)
	case "PONG":
		// no-op
	case "JOIN":
		h.handleJOIN(msg)
	case "PART":
		h.handlePART(msg)
	case "PRIVMSG":
		h.handlePRIVMSG(msg)
	case "NOTICE":
		h.handleNOTICE(msg)
	case "TOPIC":
		h.handleTOPIC(msg)
	case "NAMES":
		h.handleNAMES(msg)
	case "LIST":
		h.handleLIST(msg)
	case "WHO":
		h.handleWHO(msg)
	case "WHOIS":
		h.handleWHOIS(msg)
	case "MODE":
		h.handleMODE(msg)
	case "AWAY":
		h.handleAWAY(msg)
	case "QUIT":
		h.handleQUIT(msg)
	case "KICK":
		h.handleKICK(msg)
	case "INVITE":
		h.handleINVITE(msg)
	case "CHATHISTORY":
		h.handleCHATHISTORY(msg)
	case "SETNAME":
		h.handleSETNAME(msg)
	default:
		h.send(ircv3.FromServer(h.srv, "421", h.nick(), msg.Command, "Unknown command"))
	}
}

// ─── CAP ──────────────────────────────────────────────────────────────────────

func (h *Handler) handleCAP(msg *ircv3.Message) {
	if len(msg.Params) < 2 {
		return
	}
	sub := strings.ToUpper(msg.Params[1])

	switch sub {
	case "LS":
		h.client.User.CapPhase = true
		capList := strings.Join(ircv3.SupportedCaps, " ")
		h.send(ircv3.FromServer(h.srv, "CAP", "*", "LS", capList))

	case "REQ":
		requested := strings.TrimPrefix(msg.Params[2], ":")
		var ack, nak []string
		for _, cap := range strings.Fields(requested) {
			cap = strings.TrimPrefix(cap, "-")
			found := false
			for _, s := range ircv3.SupportedCaps {
				if s == cap {
					found = true
					break
				}
			}
			if found {
				h.client.User.SetCap(cap)
				ack = append(ack, cap)
			} else {
				nak = append(nak, cap)
			}
		}
		if len(nak) > 0 {
			h.send(ircv3.FromServer(h.srv, "CAP", h.nick(), "NAK", strings.Join(nak, " ")))
		}
		if len(ack) > 0 {
			h.send(ircv3.FromServer(h.srv, "CAP", h.nick(), "ACK", strings.Join(ack, " ")))
		}

	case "LIST":
		var caps []string
		for cap := range h.client.User.Caps {
			caps = append(caps, cap)
		}
		h.send(ircv3.FromServer(h.srv, "CAP", h.nick(), "LIST", strings.Join(caps, " ")))

	case "END":
		h.client.User.CapPhase = false
		h.tryFinishRegistration()
	}
}

// ─── NICK / USER ──────────────────────────────────────────────────────────────

func (h *Handler) handleNICK(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		h.send(ircv3.FromServer(h.srv, "431", h.nick(), "No nickname given"))
		return
	}
	newNick := msg.Params[0]

	if !validNick(newNick) {
		h.send(ircv3.FromServer(h.srv, "432", h.nick(), newNick, "Erroneous nickname"))
		return
	}
	if h.hub.NickInUse(newNick) && strings.ToLower(newNick) != strings.ToLower(h.nick()) {
		h.send(ircv3.FromServer(h.srv, "433", h.nick(), newNick, "Nickname is already in use"))
		return
	}

	oldNick := h.nick()
	oldPrefix := h.client.User.Prefix()
	h.hub.SetNick(h.client, newNick)

	if oldNick != "" && oldNick != newNick {
		// Notify all shared channels
		nickMsg := &ircv3.Message{
			Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
			Prefix:  oldPrefix,
			Command: "NICK",
			Params:  []string{newNick},
		}
		h.broadcastToSharedChannels(nickMsg, oldNick)
	}

	h.tryFinishRegistration()
}

func (h *Handler) handleUSER(msg *ircv3.Message) {
	if len(msg.Params) < 4 {
		h.send(ircv3.FromServer(h.srv, "461", h.nick(), "USER", "Not enough parameters"))
		return
	}
	u := h.client.User
	u.Username = msg.Params[0]
	u.Realname = msg.Params[3]
	u.UserSet = true
	h.tryFinishRegistration()
}

func (h *Handler) tryFinishRegistration() {
	u := h.client.User
	if u.IsRegistered() && !u.NickSet {
		return
	}
	if u.NickSet && u.UserSet && !u.CapPhase {
		if u.Username == "" {
			u.Username = u.Nick
		}
		if u.Realname == "" {
			u.Realname = u.Nick
		}
		h.hub.SendWelcome(h.client)
	}
}

// ─── PING ─────────────────────────────────────────────────────────────────────

func (h *Handler) handlePING(msg *ircv3.Message) {
	token := h.srv
	if len(msg.Params) > 0 {
		token = msg.Params[0]
	}
	h.send(ircv3.FromServer(h.srv, "PONG", h.srv, token))
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleJOIN(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		h.send(ircv3.FromServer(h.srv, "461", h.nick(), "JOIN", "Not enough parameters"))
		return
	}

	channels := strings.Split(msg.Params[0], ",")
	for _, name := range channels {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !validChannel(name) {
			h.send(ircv3.FromServer(h.srv, "403", h.nick(), name, "No such channel"))
			continue
		}

		ch := h.hub.GetOrCreateChannel(name)

		// Already in channel?
		if ch.HasMember(h.nick()) {
			continue
		}

		// Assign op if first member
		prefix := ""
		if ch.MemberCount() == 0 {
			prefix = models.ModeOp
		}
		ch.AddMember(h.client.User, prefix)

		// Broadcast JOIN to channel (including the joiner)
		joinMsg := &ircv3.Message{
			Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
			Prefix:  h.client.User.Prefix(),
			Command: "JOIN",
			Params:  []string{name},
		}
		// extended-join: include account name and realname
		if h.client.User.HasCap("extended-join") {
			acc := h.client.User.Account
			if acc == "" {
				acc = "*"
			}
			joinMsg.Params = append(joinMsg.Params, acc, h.client.User.Realname)
		}

		h.hub.BroadcastChannel(ch, joinMsg, "")

		// Send NAMES burst + history to the joining client
		h.hub.SendJoinBurst(h.client, ch)
		h.hub.SendChannelHistory(h.client, ch, 50)

		log.Printf("irc: %s joined %s", h.nick(), name)
	}
}

// ─── PART ─────────────────────────────────────────────────────────────────────

func (h *Handler) handlePART(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		h.send(ircv3.FromServer(h.srv, "461", h.nick(), "PART", "Not enough parameters"))
		return
	}
	reason := "Leaving"
	if len(msg.Params) > 1 {
		reason = msg.Params[1]
	}

	for _, name := range strings.Split(msg.Params[0], ",") {
		ch, ok := h.hub.GetChannel(name)
		if !ok || !ch.HasMember(h.nick()) {
			h.send(ircv3.FromServer(h.srv, "442", h.nick(), name, "You're not on that channel"))
			continue
		}

		partMsg := &ircv3.Message{
			Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
			Prefix:  h.client.User.Prefix(),
			Command: "PART",
			Params:  []string{name, reason},
		}
		h.hub.BroadcastChannel(ch, partMsg, "")
		ch.RemoveMember(h.nick())
	}
}

// ─── PRIVMSG / NOTICE ─────────────────────────────────────────────────────────

func (h *Handler) handlePRIVMSG(msg *ircv3.Message) {
	h.relayMessage("PRIVMSG", msg)
}
func (h *Handler) handleNOTICE(msg *ircv3.Message) {
	h.relayMessage("NOTICE", msg)
}

func (h *Handler) relayMessage(cmd string, msg *ircv3.Message) {
	if len(msg.Params) < 2 {
		h.send(ircv3.FromServer(h.srv, "412", h.nick(), "No text to send"))
		return
	}
	target := msg.Params[0]
	text := msg.Params[1]

	outTags := map[string]string{
		"time":  time.Now().UTC().Format(time.RFC3339Nano),
		"msgid": newMsgID(),
	}
	// Forward client-supplied tags (e.g. +typing, +react)
	for k, v := range msg.Tags {
		if strings.HasPrefix(k, "+") {
			outTags[k] = v
		}
	}

	outMsg := &ircv3.Message{
		Tags:    outTags,
		Prefix:  h.client.User.Prefix(),
		Command: cmd,
		Params:  []string{target, text},
	}

	if strings.HasPrefix(target, "#") {
		// Channel message
		ch, ok := h.hub.GetChannel(target)
		if !ok {
			h.send(ircv3.FromServer(h.srv, "403", h.nick(), target, "No such channel"))
			return
		}
		if !ch.HasMember(h.nick()) {
			h.send(ircv3.FromServer(h.srv, "404", h.nick(), target, "Cannot send to channel"))
			return
		}

		// Store in history
		ch.AppendHistory(&models.HistoryEntry{
			Time:    time.Now(),
			MsgID:   outTags["msgid"],
			Prefix:  h.client.User.Prefix(),
			Command: cmd,
			Params:  []string{target, text},
			Tags:    outTags,
		})

		// Broadcast to all members; echo-message handled inside BroadcastChannelTagged
		h.hub.BroadcastChannelTagged(ch, outMsg, h.client.ID)

	} else {
		// Direct message
		dest, ok := h.hub.ClientByNick(target)
		if !ok {
			h.send(ircv3.FromServer(h.srv, "401", h.nick(), target, "No such nick"))
			return
		}
		dest.Send(outMsg)
		// echo-message
		if h.client.User.HasCap("echo-message") {
			h.send(outMsg)
		}
	}
}

// ─── TOPIC ────────────────────────────────────────────────────────────────────

func (h *Handler) handleTOPIC(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	ch, ok := h.hub.GetChannel(msg.Params[0])
	if !ok {
		h.send(ircv3.FromServer(h.srv, "403", h.nick(), msg.Params[0], "No such channel"))
		return
	}
	if len(msg.Params) == 1 {
		// Query
		if ch.Topic == "" {
			h.send(ircv3.FromServer(h.srv, "331", h.nick(), ch.Name, "No topic is set"))
		} else {
			h.send(ircv3.FromServer(h.srv, "332", h.nick(), ch.Name, ch.Topic))
			h.send(ircv3.FromServer(h.srv, "333", h.nick(), ch.Name, ch.TopicBy, fmt.Sprintf("%d", ch.TopicAt.Unix())))
		}
		return
	}
	// Set
	ch.Topic = msg.Params[1]
	ch.TopicBy = h.client.User.Prefix()
	ch.TopicAt = time.Now()

	topicMsg := &ircv3.Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  h.client.User.Prefix(),
		Command: "TOPIC",
		Params:  []string{ch.Name, ch.Topic},
	}
	h.hub.BroadcastChannel(ch, topicMsg, "")
}

// ─── NAMES ────────────────────────────────────────────────────────────────────

func (h *Handler) handleNAMES(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	ch, ok := h.hub.GetChannel(msg.Params[0])
	if !ok {
		h.send(ircv3.FromServer(h.srv, "366", h.nick(), msg.Params[0], "End of /NAMES list"))
		return
	}
	h.hub.SendJoinBurst(h.client, ch)
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleLIST(msg *ircv3.Message) {
	h.send(ircv3.FromServer(h.srv, "321", h.nick(), "Channel", "Users  Name"))
	for _, ch := range h.hub.ChannelList() {
		h.send(ircv3.FromServer(h.srv, "322", h.nick(), ch.Name,
			fmt.Sprintf("%d", ch.MemberCount()), ch.Topic))
	}
	h.send(ircv3.FromServer(h.srv, "323", h.nick(), "End of /LIST"))
}

// ─── WHO ──────────────────────────────────────────────────────────────────────

func (h *Handler) handleWHO(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	target := msg.Params[0]
	ch, ok := h.hub.GetChannel(target)
	if !ok {
		h.send(ircv3.FromServer(h.srv, "315", h.nick(), target, "End of /WHO list"))
		return
	}
	for _, m := range ch.MemberList() {
		away := "H"
		if m.User.IsAway() {
			away = "G"
		}
		h.send(ircv3.FromServer(h.srv, "352", h.nick(),
			ch.Name, m.User.Username, m.User.Host, h.srv,
			m.User.Nick, away+m.Prefix,
			fmt.Sprintf("0 %s", m.User.Realname),
		))
	}
	h.send(ircv3.FromServer(h.srv, "315", h.nick(), target, "End of /WHO list"))
}

// ─── WHOIS ────────────────────────────────────────────────────────────────────

func (h *Handler) handleWHOIS(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	target := msg.Params[0]
	tc, ok := h.hub.ClientByNick(target)
	if !ok {
		h.send(ircv3.FromServer(h.srv, "401", h.nick(), target, "No such nick"))
		return
	}
	u := tc.User
	h.send(ircv3.FromServer(h.srv, "311", h.nick(), u.Nick, u.Username, u.Host, "*", u.Realname))
	h.send(ircv3.FromServer(h.srv, "317", h.nick(), u.Nick,
		fmt.Sprintf("%d", int(time.Since(u.ConnectedAt).Seconds())), "seconds idle"))
	if u.Account != "" {
		h.send(ircv3.FromServer(h.srv, "330", h.nick(), u.Nick, u.Account, "is logged in as"))
	}
	h.send(ircv3.FromServer(h.srv, "318", h.nick(), target, "End of /WHOIS list"))
}

// ─── MODE ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleMODE(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	target := msg.Params[0]

	if strings.HasPrefix(target, "#") {
		ch, ok := h.hub.GetChannel(target)
		if !ok {
			h.send(ircv3.FromServer(h.srv, "403", h.nick(), target, "No such channel"))
			return
		}
		if len(msg.Params) == 1 {
			h.send(ircv3.FromServer(h.srv, "324", h.nick(), ch.Name, ch.ModeString()))
			return
		}
		// Mode changes — simplified: just echo back
		modeMsg := &ircv3.Message{
			Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
			Prefix:  h.client.User.Prefix(),
			Command: "MODE",
			Params:  append([]string{ch.Name}, msg.Params[1:]...),
		}
		h.hub.BroadcastChannel(ch, modeMsg, "")
	} else {
		// User mode
		if target != h.nick() {
			h.send(ircv3.FromServer(h.srv, "502", h.nick(), "Can't change mode for other users"))
			return
		}
		if len(msg.Params) == 1 {
			h.send(ircv3.FromServer(h.srv, "221", h.nick(), "+i"))
		}
	}
}

// ─── AWAY ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleAWAY(msg *ircv3.Message) {
	u := h.client.User
	if len(msg.Params) == 0 {
		u.Away = ""
		h.send(ircv3.FromServer(h.srv, "305", h.nick(), "You are no longer marked as being away"))
	} else {
		u.Away = msg.Params[0]
		h.send(ircv3.FromServer(h.srv, "306", h.nick(), "You have been marked as being away"))
	}

	// away-notify: broadcast to all clients sharing a channel
	if true { // all clients support away-notify in this server
		awayMsg := &ircv3.Message{
			Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
			Prefix:  h.client.User.Prefix(),
			Command: "AWAY",
			Params:  nil,
		}
		if u.Away != "" {
			awayMsg.Params = []string{u.Away}
		}
		h.broadcastToSharedChannelsExcludeSelf(awayMsg)
	}
}

// ─── QUIT ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleQUIT(msg *ircv3.Message) {
	reason := "Client Quit"
	if len(msg.Params) > 0 {
		reason = msg.Params[0]
	}
	h.BroadcastQuit(reason)
}

// BroadcastQuit is called by the WS layer on disconnect.
func (h *Handler) BroadcastQuit(reason string) {
	quitMsg := &ircv3.Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  h.client.User.Prefix(),
		Command: "QUIT",
		Params:  []string{reason},
	}
	h.broadcastToSharedChannelsExcludeSelf(quitMsg)

	// Remove from all channels
	for _, ch := range h.hub.ChannelList() {
		ch.RemoveMember(h.nick())
	}
	h.hub.Unregister(h.client.ID)
	log.Printf("irc: %s quit: %s", h.nick(), reason)
}

// ─── KICK ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleKICK(msg *ircv3.Message) {
	if len(msg.Params) < 2 {
		return
	}
	chName := msg.Params[0]
	target := msg.Params[1]
	reason := h.nick()
	if len(msg.Params) > 2 {
		reason = msg.Params[2]
	}

	ch, ok := h.hub.GetChannel(chName)
	if !ok {
		h.send(ircv3.FromServer(h.srv, "403", h.nick(), chName, "No such channel"))
		return
	}

	mem, ok := ch.GetMember(h.nick())
	if !ok || mem.Prefix != models.ModeOp {
		h.send(ircv3.FromServer(h.srv, "482", h.nick(), chName, "You're not channel operator"))
		return
	}

	kickMsg := &ircv3.Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  h.client.User.Prefix(),
		Command: "KICK",
		Params:  []string{chName, target, reason},
	}
	h.hub.BroadcastChannel(ch, kickMsg, "")
	ch.RemoveMember(target)
}

// ─── INVITE ───────────────────────────────────────────────────────────────────

func (h *Handler) handleINVITE(msg *ircv3.Message) {
	if len(msg.Params) < 2 {
		return
	}
	target := msg.Params[0]
	chName := msg.Params[1]

	tc, ok := h.hub.ClientByNick(target)
	if !ok {
		h.send(ircv3.FromServer(h.srv, "401", h.nick(), target, "No such nick"))
		return
	}

	invMsg := &ircv3.Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  h.client.User.Prefix(),
		Command: "INVITE",
		Params:  []string{target, chName},
	}
	tc.Send(invMsg)
	h.send(ircv3.FromServer(h.srv, "341", h.nick(), target, chName))

	// invite-notify: tell channel ops
	if ch, ok := h.hub.GetChannel(chName); ok {
		for _, m := range ch.MemberList() {
			if m.Prefix == models.ModeOp || m.Prefix == models.ModeAdmin {
				if cl, ok := h.hub.ClientByNick(m.User.Nick); ok && cl.User.HasCap("invite-notify") {
					cl.Send(invMsg)
				}
			}
		}
	}
}

// ─── CHATHISTORY (draft) ──────────────────────────────────────────────────────

func (h *Handler) handleCHATHISTORY(msg *ircv3.Message) {
	if !h.client.User.HasCap("draft/chathistory") {
		return
	}
	if len(msg.Params) < 3 {
		return
	}
	// CHATHISTORY BEFORE <target> <timestamp> <limit>
	target := msg.Params[1]
	ch, ok := h.hub.GetChannel(target)
	if !ok {
		return
	}
	limit := 50
	entries := ch.GetHistory(time.Now(), limit)
	for _, e := range entries {
		h.send(&ircv3.Message{Tags: e.Tags, Prefix: e.Prefix, Command: e.Command, Params: e.Params})
	}
}

// ─── SETNAME ──────────────────────────────────────────────────────────────────

func (h *Handler) handleSETNAME(msg *ircv3.Message) {
	if len(msg.Params) < 1 {
		return
	}
	h.client.User.Realname = msg.Params[0]
	setMsg := &ircv3.Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  h.client.User.Prefix(),
		Command: "SETNAME",
		Params:  []string{msg.Params[0]},
	}
	h.broadcastToSharedChannels(setMsg, "")
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (h *Handler) nick() string { return h.client.User.Nick }

func (h *Handler) send(msg *ircv3.Message) {
	h.client.Send(ircv3.WithServerTime(msg))
}

func (h *Handler) broadcastToSharedChannels(msg *ircv3.Message, oldNick string) {
	seen := make(map[string]bool)
	// Use current nick for lookup
	lookupNick := h.nick()
	if oldNick != "" {
		lookupNick = oldNick
	}

	for _, ch := range h.hub.ChannelList() {
		if ch.HasMember(lookupNick) || ch.HasMember(h.nick()) {
			for _, m := range ch.MemberList() {
				if !seen[m.User.Nick] {
					seen[m.User.Nick] = true
					if cl, ok := h.hub.ClientByNick(m.User.Nick); ok {
						cl.Send(ircv3.WithServerTime(msg))
					}
				}
			}
		}
	}
}

func (h *Handler) broadcastToSharedChannelsExcludeSelf(msg *ircv3.Message) {
	seen := make(map[string]bool)
	seen[h.nick()] = true
	for _, ch := range h.hub.ChannelList() {
		if ch.HasMember(h.nick()) {
			for _, m := range ch.MemberList() {
				if !seen[m.User.Nick] {
					seen[m.User.Nick] = true
					if cl, ok := h.hub.ClientByNick(m.User.Nick); ok {
						cl.Send(ircv3.WithServerTime(msg))
					}
				}
			}
		}
	}
}

var msgCounter uint64

func newMsgID() string {
	msgCounter++
	return fmt.Sprintf("korechat-%d-%d", time.Now().UnixNano(), msgCounter)
}

func validNick(nick string) bool {
	if len(nick) == 0 || len(nick) > 30 {
		return false
	}
	for _, c := range nick {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '[' || c == ']' || c == '{' || c == '}' || c == '\\' || c == '`' || c == '|') {
			return false
		}
	}
	return true
}

func validChannel(name string) bool {
	return strings.HasPrefix(name, "#") && len(name) > 1 && len(name) <= 50
}
