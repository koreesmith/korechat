// Package ircv3 implements IRCv3 message parsing, formatting, and capability negotiation.
package ircv3

import (
	"strings"
	"time"
)

// ─── Capabilities ────────────────────────────────────────────────────────────

// SupportedCaps is the full set of IRCv3 capabilities this server advertises.
var SupportedCaps = []string{
	"multi-prefix",
	"away-notify",
	"account-notify",
	"extended-join",
	"sasl",
	"server-time",
	"message-tags",
	"batch",
	"labeled-response",
	"echo-message",
	"invite-notify",
	"cap-notify",
	"userhost-in-names",
	"chghost",
	"setname",
	"draft/chathistory",
}

// ─── Message ─────────────────────────────────────────────────────────────────

// Message represents a parsed IRC message, including IRCv3 message tags.
type Message struct {
	Tags    map[string]string
	Prefix  string // nick!user@host or server name
	Command string
	Params  []string
}

// Nick extracts the nick from a Prefix of the form nick!user@host.
func (m *Message) Nick() string {
	if idx := strings.Index(m.Prefix, "!"); idx != -1 {
		return m.Prefix[:idx]
	}
	return m.Prefix
}

// Tag returns a tag value and whether it was present.
func (m *Message) Tag(key string) (string, bool) {
	v, ok := m.Tags[key]
	return v, ok
}

// Trailing returns the last param (the "trailing" in IRC parlance).
func (m *Message) Trailing() string {
	if len(m.Params) == 0 {
		return ""
	}
	return m.Params[len(m.Params)-1]
}

// Parse parses a raw IRC line into a Message.
func Parse(raw string) *Message {
	raw = strings.TrimRight(raw, "\r\n")
	msg := &Message{Tags: make(map[string]string)}
	pos := 0

	// Tags
	if len(raw) > pos && raw[pos] == '@' {
		pos++
		end := strings.Index(raw[pos:], " ")
		if end == -1 {
			return msg
		}
		tagStr := raw[pos : pos+end]
		pos += end + 1
		for _, tag := range strings.Split(tagStr, ";") {
			if tag == "" {
				continue
			}
			k, v, _ := strings.Cut(tag, "=")
			msg.Tags[k] = unescapeTagValue(v)
		}
	}

	// Prefix
	if len(raw) > pos && raw[pos] == ':' {
		pos++
		end := strings.Index(raw[pos:], " ")
		if end == -1 {
			msg.Prefix = raw[pos:]
			return msg
		}
		msg.Prefix = raw[pos : pos+end]
		pos += end + 1
	}

	// Command
	end := strings.Index(raw[pos:], " ")
	if end == -1 {
		msg.Command = strings.ToUpper(raw[pos:])
		return msg
	}
	msg.Command = strings.ToUpper(raw[pos : pos+end])
	pos += end + 1

	// Params
	for pos < len(raw) {
		if raw[pos] == ':' {
			msg.Params = append(msg.Params, raw[pos+1:])
			break
		}
		end = strings.Index(raw[pos:], " ")
		if end == -1 {
			msg.Params = append(msg.Params, raw[pos:])
			break
		}
		msg.Params = append(msg.Params, raw[pos:pos+end])
		pos += end + 1
	}

	return msg
}

// Format serialises a Message back to a raw IRC line (without CRLF).
func Format(msg *Message) string {
	var b strings.Builder

	if len(msg.Tags) > 0 {
		b.WriteByte('@')
		first := true
		for k, v := range msg.Tags {
			if !first {
				b.WriteByte(';')
			}
			b.WriteString(k)
			if v != "" {
				b.WriteByte('=')
				b.WriteString(escapeTagValue(v))
			}
			first = false
		}
		b.WriteByte(' ')
	}

	if msg.Prefix != "" {
		b.WriteByte(':')
		b.WriteString(msg.Prefix)
		b.WriteByte(' ')
	}

	b.WriteString(msg.Command)

	for i, p := range msg.Params {
		b.WriteByte(' ')
		if i == len(msg.Params)-1 && (strings.Contains(p, " ") || strings.HasPrefix(p, ":") || p == "") {
			b.WriteByte(':')
		}
		b.WriteString(p)
	}

	return b.String()
}

// WithServerTime injects the current server-time tag into a message copy.
func WithServerTime(msg *Message) *Message {
	tags := make(map[string]string, len(msg.Tags)+1)
	for k, v := range msg.Tags {
		tags[k] = v
	}
	tags["time"] = time.Now().UTC().Format(time.RFC3339Nano)
	return &Message{Tags: tags, Prefix: msg.Prefix, Command: msg.Command, Params: msg.Params}
}

// Simple returns a message with no tags or prefix.
func Simple(command string, params ...string) *Message {
	return &Message{Tags: make(map[string]string), Command: command, Params: params}
}

// FromServer returns a message prefixed with the given server name.
func FromServer(server, command string, params ...string) *Message {
	return &Message{Tags: map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)}, Prefix: server, Command: command, Params: params}
}

// FromNick returns a message prefixed with nick!user@host.
func FromNick(nick, user, host, command string, params ...string) *Message {
	return &Message{
		Tags:    map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano)},
		Prefix:  nick + "!" + user + "@" + host,
		Command: command,
		Params:  params,
	}
}

// ─── Tag escaping ─────────────────────────────────────────────────────────────

func escapeTagValue(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, ";", "\\:")
	s = strings.ReplaceAll(s, " ", "\\s")
	s = strings.ReplaceAll(s, "\r", "\\r")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

func unescapeTagValue(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
			switch s[i] {
			case ':':
				b.WriteByte(';')
			case 's':
				b.WriteByte(' ')
			case '\\':
				b.WriteByte('\\')
			case 'r':
				b.WriteByte('\r')
			case 'n':
				b.WriteByte('\n')
			default:
				b.WriteByte(s[i])
			}
		} else {
			b.WriteByte(s[i])
		}
	}
	return b.String()
}
