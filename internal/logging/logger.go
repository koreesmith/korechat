// Package logging provides persistent IRC message logging for KoreChat.
//
// Each user has independent settings (enabled, retention_days).
// Loggable events: PRIVMSG, NOTICE, JOIN, PART, QUIT, KICK, TOPIC, MODE.
// A background goroutine runs daily retention cleanup.
package logging

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// Entry is a single persisted IRC event.
type Entry struct {
	ID          int64     `json:"id"`
	UserID      string    `json:"user_id"`
	NetworkID   string    `json:"network_id"`
	NetworkName string    `json:"network_name"`
	Channel     string    `json:"channel"`  // "#chan" or "" for server/DMs
	Nick        string    `json:"nick"`
	Type        string    `json:"type"`     // PRIVMSG NOTICE JOIN PART QUIT KICK TOPIC MODE
	Text        string    `json:"text"`
	Timestamp   time.Time `json:"timestamp"`
}

// Settings holds per-user logging preferences.
type Settings struct {
	Enabled       bool `json:"enabled"`
	RetentionDays int  `json:"retention_days"` // 0 = keep forever
}

type cachedSettings struct {
	s  *Settings
	ts time.Time
}

// Logger writes IRC events to Postgres and manages retention.
type Logger struct {
	db    *sql.DB
	mu    sync.Mutex
	cache map[string]*cachedSettings
}

// New creates a Logger and starts the background retention worker.
func New(db *sql.DB) *Logger {
	l := &Logger{
		db:    db,
		cache: make(map[string]*cachedSettings),
	}
	go l.retentionLoop()
	return l
}

// ─── Settings ─────────────────────────────────────────────────────────────────

func (l *Logger) GetSettings(userID string) (*Settings, error) {
	s := &Settings{Enabled: true, RetentionDays: 90}
	err := l.db.QueryRow(
		`SELECT enabled, retention_days FROM log_settings WHERE user_id=$1`, userID,
	).Scan(&s.Enabled, &s.RetentionDays)
	if err == sql.ErrNoRows {
		return s, nil
	}
	return s, err
}

func (l *Logger) UpsertSettings(userID string, s *Settings) error {
	_, err := l.db.Exec(`
		INSERT INTO log_settings (user_id, enabled, retention_days, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (user_id) DO UPDATE SET enabled=$2, retention_days=$3, updated_at=NOW()`,
		userID, s.Enabled, s.RetentionDays,
	)
	l.mu.Lock()
	delete(l.cache, userID)
	l.mu.Unlock()
	return err
}

func (l *Logger) cachedSettings(userID string) (*Settings, error) {
	l.mu.Lock()
	c, ok := l.cache[userID]
	l.mu.Unlock()
	if ok && time.Since(c.ts) < 60*time.Second {
		return c.s, nil
	}
	s, err := l.GetSettings(userID)
	if err != nil {
		return nil, err
	}
	l.mu.Lock()
	l.cache[userID] = &cachedSettings{s: s, ts: time.Now()}
	l.mu.Unlock()
	return s, nil
}

// ─── Writing ──────────────────────────────────────────────────────────────────

// Log parses and persists a raw IRC line if logging is enabled for userID.
func (l *Logger) Log(userID, networkID, networkName, rawLine string) {
	e := parseIRCLine(rawLine, networkID, networkName)
	if e == nil {
		return
	}
	e.UserID = userID

	s, err := l.cachedSettings(userID)
	if err != nil || !s.Enabled {
		return
	}

	if _, err := l.db.Exec(`
		INSERT INTO message_logs
		  (user_id, network_id, network_name, channel, nick, type, text, timestamp)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		e.UserID, e.NetworkID, e.NetworkName,
		e.Channel, e.Nick, e.Type, e.Text, e.Timestamp,
	); err != nil {
		log.Printf("logging: insert: %v", err)
	}
}

// ─── Querying ─────────────────────────────────────────────────────────────────

type QueryParams struct {
	NetworkID  string
	Channel    string
	Nick       string
	Search     string
	MsgType    string
	DateFrom   time.Time
	DateTo     time.Time
	Limit      int
	Offset     int
	Ascending      bool // if true, return oldest-first (for history display)
	ServerOnly     bool // if true, return only entries with channel="" (server/DM NOTICEs)
	MembershipOnly bool // if true, filter for JOIN/PART/QUIT/KICK/MODE only
}

type QueryResult struct {
	Entries []*Entry `json:"entries"`
	Total   int      `json:"total"`
	Limit   int      `json:"limit"`
	Offset  int      `json:"offset"`
}

func (l *Logger) Query(userID string, p QueryParams) (*QueryResult, error) {
	if p.Limit <= 0 || p.Limit > 500 {
		p.Limit = 100
	}
	where, args := l.buildWhere(userID, p)

	var total int
	if err := l.db.QueryRow(
		`SELECT COUNT(*) FROM message_logs WHERE `+where, args...,
	).Scan(&total); err != nil {
		return nil, fmt.Errorf("count: %w", err)
	}

	args = append(args, p.Limit, p.Offset)
	orderDir := "DESC"
	if p.Ascending {
		orderDir = "ASC"
	}
	q := fmt.Sprintf(`
		SELECT id, user_id, network_id, network_name, channel, nick, type, text, timestamp
		FROM message_logs WHERE %s
		ORDER BY timestamp %s
		LIMIT $%d OFFSET $%d`, where, orderDir, len(args)-1, len(args))

	rows, err := l.db.Query(q, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	var entries []*Entry
	for rows.Next() {
		e := &Entry{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.NetworkID, &e.NetworkName,
			&e.Channel, &e.Nick, &e.Type, &e.Text, &e.Timestamp); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []*Entry{}
	}
	return &QueryResult{Entries: entries, Total: total, Limit: p.Limit, Offset: p.Offset}, rows.Err()
}

// QueryAll fetches all matching entries (for CSV export).
func (l *Logger) QueryAll(userID string, p QueryParams) ([]*Entry, error) {
	p.Limit = 100000
	p.Offset = 0
	where, args := l.buildWhere(userID, p)
	args = append(args, p.Limit, p.Offset)
	q := fmt.Sprintf(`
		SELECT id, user_id, network_id, network_name, channel, nick, type, text, timestamp
		FROM message_logs WHERE %s
		ORDER BY timestamp ASC
		LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args))

	rows, err := l.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []*Entry
	for rows.Next() {
		e := &Entry{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.NetworkID, &e.NetworkName,
			&e.Channel, &e.Nick, &e.Type, &e.Text, &e.Timestamp); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// Networks returns distinct (network_id, network_name) pairs the user has logs for.
func (l *Logger) Networks(userID string) ([]map[string]string, error) {
	rows, err := l.db.Query(`
		SELECT DISTINCT network_id, network_name FROM message_logs
		WHERE user_id=$1 ORDER BY network_name ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]string
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out = append(out, map[string]string{"id": id, "name": name})
	}
	return out, rows.Err()
}

// Channels returns distinct channels for a user+network.
func (l *Logger) Channels(userID, networkID string) ([]string, error) {
	rows, err := l.db.Query(`
		SELECT DISTINCT channel FROM message_logs
		WHERE user_id=$1 AND network_id=$2 AND channel != ''
		ORDER BY channel ASC`, userID, networkID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var ch string
		if err := rows.Scan(&ch); err != nil {
			return nil, err
		}
		out = append(out, ch)
	}
	return out, rows.Err()
}

// ToRawLine reconstructs a synthetic raw IRC line suitable for BNC replay.
// Includes an @time= tag so the client can sort by timestamp.
// Returns "" for event types that cannot be meaningfully reconstructed.
func (e *Entry) ToRawLine() string {
	ts := e.Timestamp.UTC().Format(time.RFC3339Nano)
	switch e.Type {
	case "PRIVMSG", "NOTICE":
		if e.Channel == "" {
			return "" // DM with no channel target — skip
		}
		return fmt.Sprintf("@time=%s :%s!*@* %s %s :%s", ts, e.Nick, e.Type, e.Channel, e.Text)
	}
	return ""
}

// ReplayLines returns reconstructed raw IRC lines for the given channel,
// in chronological order (oldest first), for messages with timestamp < before.
// Used by the BNC to fill ring-buffer gaps during subscriber replay.
func (l *Logger) ReplayLines(userID, networkID, channel string, before time.Time, limit int) ([]string, error) {
	if limit <= 0 || limit > 2000 {
		limit = 2000
	}
	result, err := l.Query(userID, QueryParams{
		NetworkID: networkID,
		Channel:   channel,
		DateTo:    before,
		Limit:     limit,
		Ascending: true,
	})
	if err != nil {
		return nil, err
	}
	lines := make([]string, 0, len(result.Entries))
	for _, e := range result.Entries {
		if line := e.ToRawLine(); line != "" {
			lines = append(lines, line)
		}
	}
	return lines, nil
}

// DeleteAll removes every log entry for a user.
func (l *Logger) DeleteAll(userID string) (int64, error) {
	res, err := l.db.Exec(`DELETE FROM message_logs WHERE user_id=$1`, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ─── Retention ────────────────────────────────────────────────────────────────

func (l *Logger) retentionLoop() {
	time.Sleep(30 * time.Second) // let startup settle
	for {
		l.runRetention()
		time.Sleep(24 * time.Hour)
	}
}

func (l *Logger) runRetention() {
	rows, err := l.db.Query(`
		SELECT user_id, retention_days FROM log_settings
		WHERE enabled=true AND retention_days > 0`)
	if err != nil {
		log.Printf("logging: retention query: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		var days int
		if err := rows.Scan(&uid, &days); err != nil {
			continue
		}
		cutoff := time.Now().AddDate(0, 0, -days)
		res, err := l.db.Exec(
			`DELETE FROM message_logs WHERE user_id=$1 AND timestamp < $2`, uid, cutoff)
		if err != nil {
			log.Printf("logging: retention delete %s: %v", uid, err)
			continue
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			log.Printf("logging: retention: removed %d entries for user %s (>%d days)", n, uid, days)
		}
	}
}

// ─── IRC line parser ──────────────────────────────────────────────────────────

func parseIRCLine(raw, networkID, networkName string) *Entry {
	line := strings.TrimRight(raw, "\r\n")

	// Parse IRCv3 tags (@tag=val ...) — extract server-time before stripping
	var serverTime time.Time
	if strings.HasPrefix(line, "@") {
		sp := strings.Index(line, " ")
		if sp < 0 {
			return nil
		}
		tagStr := line[1:sp]
		for _, tag := range strings.Split(tagStr, ";") {
			if strings.HasPrefix(tag, "time=") {
				if t, err := time.Parse(time.RFC3339Nano, tag[5:]); err == nil {
					serverTime = t.UTC()
				} else if t, err := time.Parse(time.RFC3339, tag[5:]); err == nil {
					serverTime = t.UTC()
				}
			}
		}
		line = strings.TrimSpace(line[sp+1:])
	}

	// Tokenise
	var prefix, cmd string
	rest := line
	if strings.HasPrefix(rest, ":") {
		sp := strings.Index(rest, " ")
		if sp < 0 {
			return nil
		}
		prefix = rest[1:sp]
		rest = strings.TrimSpace(rest[sp+1:])
	}

	sp := strings.Index(rest, " ")
	if sp < 0 {
		cmd = strings.ToUpper(rest)
		rest = ""
	} else {
		cmd = strings.ToUpper(rest[:sp])
		rest = rest[sp+1:]
	}

	switch cmd {
	case "PRIVMSG", "NOTICE", "JOIN", "PART", "QUIT", "KICK", "TOPIC", "MODE":
	default:
		return nil
	}

	// Skip BNC synthetic messages
	if prefix == "*bnc*" || strings.HasPrefix(prefix, "*") {
		return nil
	}

	nick := nickFrom(prefix)
	now := time.Now().UTC()
	if !serverTime.IsZero() {
		now = serverTime
	}

	e := &Entry{
		NetworkID:   networkID,
		NetworkName: networkName,
		Nick:        nick,
		Type:        cmd,
		Timestamp:   now,
	}

	// params splits the remaining text respecting the trailing ":param" convention
	params := splitParams(rest)

	switch cmd {
	case "PRIVMSG", "NOTICE":
		if len(params) < 2 {
			return nil
		}
		target := params[0]
		text := params[1]
		if strings.HasPrefix(target, "#") || strings.HasPrefix(target, "&") {
			e.Channel = target
		}
		e.Text = text

	case "JOIN":
		if len(params) > 0 {
			e.Channel = params[0]
		}
		e.Text = nick + " joined " + e.Channel

	case "PART":
		if len(params) > 0 {
			e.Channel = params[0]
		}
		reason := ""
		if len(params) > 1 {
			reason = params[1]
		}
		e.Text = nick + " left " + e.Channel
		if reason != "" {
			e.Text += " (" + reason + ")"
		}

	case "QUIT":
		reason := ""
		if len(params) > 0 {
			reason = params[0]
		}
		e.Text = nick + " quit (" + reason + ")"

	case "KICK":
		if len(params) < 2 {
			return nil
		}
		e.Channel = params[0]
		reason := ""
		if len(params) > 2 {
			reason = ": " + params[2]
		}
		e.Text = nick + " kicked " + params[1] + reason

	case "TOPIC":
		if len(params) < 1 {
			return nil
		}
		e.Channel = params[0]
		topic := ""
		if len(params) > 1 {
			topic = params[1]
		}
		e.Text = nick + " set topic: " + topic

	case "MODE":
		if len(params) > 0 && (strings.HasPrefix(params[0], "#") || strings.HasPrefix(params[0], "&")) {
			e.Channel = params[0]
		}
		e.Text = nick + " set mode: " + rest
	}

	return e
}

// splitParams parses IRC params, handling the trailing ":..." token.
func splitParams(s string) []string {
	var out []string
	for len(s) > 0 {
		s = strings.TrimLeft(s, " ")
		if strings.HasPrefix(s, ":") {
			out = append(out, s[1:])
			break
		}
		sp := strings.Index(s, " ")
		if sp < 0 {
			out = append(out, s)
			break
		}
		out = append(out, s[:sp])
		s = s[sp+1:]
	}
	return out
}

func nickFrom(prefix string) string {
	if i := strings.Index(prefix, "!"); i >= 0 {
		return prefix[:i]
	}
	return prefix
}

func (l *Logger) buildWhere(userID string, p QueryParams) (string, []interface{}) {
	conds := []string{"user_id = $1"}
	args := []interface{}{userID}
	n := 1
	add := func(cond string, v interface{}) {
		n++
		conds = append(conds, fmt.Sprintf(cond, n))
		args = append(args, v)
	}
	if p.NetworkID != "" {
		add("network_id = $%d", p.NetworkID)
	}
	if p.ServerOnly {
		conds = append(conds, "channel = ''")
	} else if p.Channel != "" {
		add("lower(channel) = lower($%d)", p.Channel)
	}
	if p.Nick != "" {
		add("nick ILIKE $%d", p.Nick+"%")
	}
	if p.Search != "" {
		add("text ILIKE $%d", "%"+p.Search+"%")
	}
	if p.MsgType != "" {
		add("type = $%d", strings.ToUpper(p.MsgType))
	}
	if p.MembershipOnly {
		conds = append(conds, "type IN ('JOIN','PART','QUIT','KICK','MODE')")
	}
	if !p.DateFrom.IsZero() {
		add("timestamp >= $%d", p.DateFrom)
	}
	if !p.DateTo.IsZero() {
		add("timestamp <= $%d", p.DateTo)
	}
	return strings.Join(conds, " AND "), args
}
