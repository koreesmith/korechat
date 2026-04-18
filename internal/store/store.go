// Package store provides Postgres-backed persistence for KoreChat.
//
// Tables managed here:
//   - users       (application accounts)
//   - networks    (per-user IRC network configurations)
//
// The store runs migrations on startup; no external migration tool needed.
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq" // Postgres driver

	"github.com/koree/korechat/internal/networks"
	"github.com/koree/korechat/internal/users"
)

// DB wraps a *sql.DB and exposes all persistence operations.
type DB struct {
	db *sql.DB
}

// Open connects to Postgres and runs migrations.
func Open(dsn string) (*DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Retry connection — Postgres may not be ready on first startup
	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Printf("store: waiting for postgres (%d/10): %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("store: postgres not reachable: %w", err)
	}

	s := &DB{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("store: migration failed: %w", err)
	}
	return s, nil
}

// Close shuts down the connection pool.
func (s *DB) Close() error { return s.db.Close() }

// RawDB returns the underlying *sql.DB for packages that need direct access (e.g. logging).
func (s *DB) RawDB() *sql.DB { return s.db }

// ─── Migrations ───────────────────────────────────────────────────────────────

func (s *DB) migrate() error {
	// v1: base tables
	if _, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		username      TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		display_name  TEXT NOT NULL DEFAULT '',
		role          TEXT NOT NULL DEFAULT 'user',
		created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS networks (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name       TEXT NOT NULL,
		host       TEXT NOT NULL,
		port       INTEGER NOT NULL DEFAULT 6667,
		tls        BOOLEAN NOT NULL DEFAULT FALSE,
		password   TEXT NOT NULL DEFAULT '',
		nick       TEXT NOT NULL,
		alt_nick   TEXT NOT NULL DEFAULT '',
		username   TEXT NOT NULL DEFAULT '',
		realname   TEXT NOT NULL DEFAULT '',
		auto_join  TEXT[] NOT NULL DEFAULT '{}',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS networks_user_id ON networks(user_id);
	`); err != nil {
		return fmt.Errorf("migrate v1: %w", err)
	}

	// v2: SASL columns (idempotent)
	saslCols := []struct{ col, def string }{
		{"sasl_mechanism", "TEXT NOT NULL DEFAULT ''"},
		{"sasl_username",  "TEXT NOT NULL DEFAULT ''"},
		{"sasl_password",  "TEXT NOT NULL DEFAULT ''"},
	}
	for _, c := range saslCols {
		if _, err := s.db.Exec(fmt.Sprintf(
			`ALTER TABLE networks ADD COLUMN IF NOT EXISTS %s %s`, c.col, c.def,
		)); err != nil {
			return fmt.Errorf("migrate v2 (%s): %w", c.col, err)
		}
	}

	// v3: on_connect perform commands (idempotent)
	if _, err := s.db.Exec(
		`ALTER TABLE networks ADD COLUMN IF NOT EXISTS on_connect TEXT[] NOT NULL DEFAULT '{}'`,
	); err != nil {
		return fmt.Errorf("migrate v3 (on_connect): %w", err)
	}

	// v4: user avatars (idempotent)
	if _, err := s.db.Exec(
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`,
	); err != nil {
		return fmt.Errorf("migrate v4 (avatar_url): %w", err)
	}

	// v6: user theme preference (idempotent)
	if _, err := s.db.Exec(
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark'`,
	); err != nil {
		return fmt.Errorf("migrate v6 (theme): %w", err)
	}

	// v7: BNC-tracked joined channels (idempotent)
	if _, err := s.db.Exec(
		`ALTER TABLE networks ADD COLUMN IF NOT EXISTS joined_chans TEXT[] NOT NULL DEFAULT '{}'`,
	); err != nil {
		return fmt.Errorf("migrate v7 (joined_chans): %w", err)
	}

	// v5: message logging (idempotent)
	if _, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS log_settings (
			user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			enabled        BOOLEAN NOT NULL DEFAULT TRUE,
			retention_days INTEGER NOT NULL DEFAULT 90,
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS message_logs (
			id           BIGSERIAL PRIMARY KEY,
			user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			network_id   TEXT NOT NULL,
			network_name TEXT NOT NULL DEFAULT '',
			channel      TEXT NOT NULL DEFAULT '',
			nick         TEXT NOT NULL DEFAULT '',
			type         TEXT NOT NULL,
			text         TEXT NOT NULL DEFAULT '',
			timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS message_logs_user_ts   ON message_logs(user_id, timestamp DESC);
		CREATE INDEX IF NOT EXISTS message_logs_user_net  ON message_logs(user_id, network_id);
		CREATE INDEX IF NOT EXISTS message_logs_user_chan ON message_logs(user_id, channel);
		CREATE INDEX IF NOT EXISTS message_logs_chan_ts   ON message_logs(user_id, network_id, lower(channel), timestamp DESC);
	`); err != nil {
		return fmt.Errorf("migrate v5 (logging): %w", err)
	}

	// v8: user upload tracking (idempotent)
	if _, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS user_uploads (
			id          BIGSERIAL PRIMARY KEY,
			user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			filename    TEXT NOT NULL,
			upload_type TEXT NOT NULL,
			uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS user_uploads_user_id ON user_uploads(user_id);
	`); err != nil {
		return fmt.Errorf("migrate v8 (user_uploads): %w", err)
	}

	// v9: sidebar collapse state (idempotent)
	if _, err := s.db.Exec(
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS sidebar_collapsed TEXT NOT NULL DEFAULT '{}'`,
	); err != nil {
		return fmt.Errorf("migrate v9 (sidebar_collapsed): %w", err)
	}

	log.Printf("store: migrations OK")
	return nil
}

// ─── Setup check ─────────────────────────────────────────────────────────────

// NeedsSetup returns true if no users exist yet.
func (s *DB) NeedsSetup() (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}

// ─── Users ────────────────────────────────────────────────────────────────────

// CreateUser inserts a new user and returns it with the generated ID.
func (s *DB) CreateUser(u *users.User) (*users.User, error) {
	u.ID = newID("usr")
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	if u.DisplayName == "" {
		u.DisplayName = u.Username
	}
	if u.Role == "" {
		u.Role = users.RoleUser
	}

	_, err := s.db.Exec(
		`INSERT INTO users (id, username, password_hash, display_name, theme, sidebar_collapsed, role, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		u.ID, u.Username, u.PasswordHash, u.DisplayName, u.Theme, u.SidebarCollapsed, u.Role, u.CreatedAt, u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// GetUserByID fetches a user by primary key.
func (s *DB) GetUserByID(id string) (*users.User, error) {
	return s.scanUser(s.db.QueryRow(
		`SELECT id, username, password_hash, display_name, avatar_url, theme, sidebar_collapsed, role, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	))
}

// GetUserByUsername fetches a user by username (case-insensitive).
func (s *DB) GetUserByUsername(username string) (*users.User, error) {
	return s.scanUser(s.db.QueryRow(
		`SELECT id, username, password_hash, display_name, avatar_url, theme, sidebar_collapsed, role, created_at, updated_at
		 FROM users WHERE LOWER(username) = LOWER($1)`, username,
	))
}

// GetUserByIRCNick finds a user whose configured IRC nick matches the given nick
// (case-insensitive). This resolves IRC nicks → KoreChat user avatars.
func (s *DB) GetUserByIRCNick(ircNick string) (*users.User, error) {
	return s.scanUser(s.db.QueryRow(
		`SELECT u.id, u.username, u.password_hash, u.display_name, u.avatar_url, u.theme, u.sidebar_collapsed, u.role, u.created_at, u.updated_at
		 FROM users u
		 JOIN networks n ON n.user_id = u.id
		 WHERE LOWER(n.nick) = LOWER($1)
		 LIMIT 1`, ircNick,
	))
}

// ListUsers returns all users, ordered by created_at.
func (s *DB) ListUsers() ([]*users.User, error) {
	rows, err := s.db.Query(
		`SELECT id, username, password_hash, display_name, avatar_url, theme, sidebar_collapsed, role, created_at, updated_at
		 FROM users ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*users.User
	for rows.Next() {
		u, err := s.scanUserRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// UpdateUser updates mutable user fields.
func (s *DB) UpdateUser(id string, patch *users.User) (*users.User, error) {
	u, err := s.GetUserByID(id)
	if err != nil {
		return nil, err
	}
	if patch.DisplayName != "" {
		u.DisplayName = patch.DisplayName
	}
	if patch.Role != "" {
		u.Role = patch.Role
	}
	if patch.PasswordHash != "" {
		u.PasswordHash = patch.PasswordHash
	}
	if patch.Theme != "" {
		u.Theme = patch.Theme
	}
	if patch.SidebarCollapsed != "" {
		u.SidebarCollapsed = patch.SidebarCollapsed
	}
	u.UpdatedAt = time.Now()
	_, err = s.db.Exec(
		`UPDATE users SET display_name=$1, role=$2, password_hash=$3, theme=$4, sidebar_collapsed=$5, updated_at=$6 WHERE id=$7`,
		u.DisplayName, u.Role, u.PasswordHash, u.Theme, u.SidebarCollapsed, u.UpdatedAt, u.ID,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// SetAvatarURL updates only the avatar_url for a user.
func (s *DB) SetAvatarURL(userID, avatarURL string) (*users.User, error) {
	_, err := s.db.Exec(
		`UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2`,
		avatarURL, userID,
	)
	if err != nil {
		return nil, err
	}
	return s.GetUserByID(userID)
}

// DeleteUser removes a user and cascades to their networks.
func (s *DB) DeleteUser(id string) error {
	res, err := s.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("user not found")
	}
	return nil
}

// AdminCount returns the number of admin-role users.
func (s *DB) AdminCount() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&n)
	return n, err
}

// ─── Networks ─────────────────────────────────────────────────────────────────

// CreateNetwork inserts a new network record for a user.
func (s *DB) CreateNetwork(userID string, n *networks.Network) (*networks.Network, error) {
	n.ID = newID("net")
	now := time.Now()
	n.CreatedAt = now
	n.UpdatedAt = now
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

	_, err := s.db.Exec(
		`INSERT INTO networks
		 (id, user_id, name, host, port, tls, password, nick, alt_nick, username, realname, auto_join,
		  sasl_mechanism, sasl_username, sasl_password, on_connect, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		n.ID, userID, n.Name, n.Host, n.Port, n.TLS, n.Password,
		n.Nick, n.AltNick, n.Username, n.Realname,
		autoJoinToDB(n.AutoJoin),
		n.SASLMechanism, n.SASLUsername, n.SASLPassword,
		autoJoinToDB(n.OnConnect),
		n.CreatedAt, n.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create network: %w", err)
	}
	return n, nil
}

// GetNetwork fetches a network by ID, verifying it belongs to userID.
func (s *DB) GetNetwork(userID, networkID string) (*networks.Network, error) {
	return s.scanNetwork(s.db.QueryRow(
		`SELECT id, name, host, port, tls, password, nick, alt_nick, username, realname, auto_join, sasl_mechanism, sasl_username, sasl_password, on_connect, joined_chans, created_at, updated_at
		 FROM networks WHERE id=$1 AND user_id=$2`,
		networkID, userID,
	))
}

// ListNetworks returns all networks for a user.
func (s *DB) ListNetworks(userID string) ([]*networks.Network, error) {
	rows, err := s.db.Query(
		`SELECT id, name, host, port, tls, password, nick, alt_nick, username, realname, auto_join, sasl_mechanism, sasl_username, sasl_password, on_connect, joined_chans, created_at, updated_at
		 FROM networks WHERE user_id=$1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*networks.Network
	for rows.Next() {
		n, err := s.scanNetworkRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// ListAllNetworks returns every network in the DB (for BNC startup).
func (s *DB) ListAllNetworks() ([]*networks.Network, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, name, host, port, tls, password, nick, alt_nick, username, realname, auto_join, sasl_mechanism, sasl_username, sasl_password, on_connect, joined_chans, created_at, updated_at
		 FROM networks ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*networks.Network
	for rows.Next() {
		n, err := s.scanNetworkRowWithUserID(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// UpdateNetwork updates mutable fields of a network.
func (s *DB) UpdateNetwork(userID, networkID string, patch *networks.Network) (*networks.Network, error) {
	n, err := s.GetNetwork(userID, networkID)
	if err != nil {
		return nil, err
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
	if patch.AltNick != "" {
		n.AltNick = patch.AltNick
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
	if len(patch.AutoJoin) > 0 {
		n.AutoJoin = patch.AutoJoin
	}
	n.TLS = patch.TLS
	n.OnConnect = patch.OnConnect // always overwrite (empty = clear all)
	n.SASLMechanism = patch.SASLMechanism
	if patch.SASLUsername != "" {
		n.SASLUsername = patch.SASLUsername
	}
	if patch.SASLPassword != "" {
		n.SASLPassword = patch.SASLPassword
	}
	n.UpdatedAt = time.Now()

	_, err = s.db.Exec(
		`UPDATE networks SET name=$1, host=$2, port=$3, tls=$4, password=$5,
		 nick=$6, alt_nick=$7, username=$8, realname=$9, auto_join=$10,
		 sasl_mechanism=$11, sasl_username=$12, sasl_password=$13, on_connect=$14, updated_at=$15
		 WHERE id=$16 AND user_id=$17`,
		n.Name, n.Host, n.Port, n.TLS, n.Password,
		n.Nick, n.AltNick, n.Username, n.Realname,
		autoJoinToDB(n.AutoJoin),
		n.SASLMechanism, n.SASLUsername, n.SASLPassword,
		autoJoinToDB(n.OnConnect),
		n.UpdatedAt,
		n.ID, userID,
	)
	if err != nil {
		return nil, err
	}
	return n, nil
}

// DeleteNetwork removes a network record.
func (s *DB) DeleteNetwork(userID, networkID string) error {
	res, err := s.db.Exec(`DELETE FROM networks WHERE id=$1 AND user_id=$2`, networkID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("network not found")
	}
	return nil
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

type scannable interface {
	Scan(dest ...interface{}) error
}

func (s *DB) scanUser(row scannable) (*users.User, error) {
	u := &users.User{}
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.DisplayName, &u.AvatarURL, &u.Theme, &u.SidebarCollapsed, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user not found")
	}
	return u, err
}

func (s *DB) scanUserRow(rows *sql.Rows) (*users.User, error) {
	u := &users.User{}
	err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.DisplayName, &u.AvatarURL, &u.Theme, &u.SidebarCollapsed, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (s *DB) scanNetwork(row scannable) (*networks.Network, error) {
	n := &networks.Network{}
	var autoJoin, onConnect, joinedChans []string
	err := row.Scan(
		&n.ID, &n.Name, &n.Host, &n.Port, &n.TLS, &n.Password,
		&n.Nick, &n.AltNick, &n.Username, &n.Realname,
		pqArray(&autoJoin),
		&n.SASLMechanism, &n.SASLUsername, &n.SASLPassword,
		pqArray(&onConnect),
		pqArray(&joinedChans),
		&n.CreatedAt, &n.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("network not found")
	}
	if err != nil {
		return nil, err
	}
	n.AutoJoin = autoJoin
	n.OnConnect = onConnect
	n.JoinedChans = joinedChans
	n.Status = networks.StatusDisconnected
	return n, nil
}

func (s *DB) scanNetworkRow(rows *sql.Rows) (*networks.Network, error) {
	n := &networks.Network{}
	var autoJoin, onConnect, joinedChans []string
	err := rows.Scan(
		&n.ID, &n.Name, &n.Host, &n.Port, &n.TLS, &n.Password,
		&n.Nick, &n.AltNick, &n.Username, &n.Realname,
		pqArray(&autoJoin),
		&n.SASLMechanism, &n.SASLUsername, &n.SASLPassword,
		pqArray(&onConnect),
		pqArray(&joinedChans),
		&n.CreatedAt, &n.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	n.AutoJoin = autoJoin
	n.OnConnect = onConnect
	n.JoinedChans = joinedChans
	n.Status = networks.StatusDisconnected
	return n, nil
}

func (s *DB) scanNetworkRowWithUserID(rows *sql.Rows) (*networks.Network, error) {
	n := &networks.Network{}
	var autoJoin, onConnect, joinedChans []string
	err := rows.Scan(
		&n.ID, &n.UserID, &n.Name, &n.Host, &n.Port, &n.TLS, &n.Password,
		&n.Nick, &n.AltNick, &n.Username, &n.Realname,
		pqArray(&autoJoin),
		&n.SASLMechanism, &n.SASLUsername, &n.SASLPassword,
		pqArray(&onConnect),
		pqArray(&joinedChans),
		&n.CreatedAt, &n.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	n.AutoJoin = autoJoin
	n.OnConnect = onConnect
	n.JoinedChans = joinedChans
	n.Status = networks.StatusDisconnected
	return n, nil
}

// SetJoinedChannels persists the BNC-tracked channel list for a network.
// Called by the BNC after every JOIN or PART/KICK so channels survive restarts.
func (s *DB) SetJoinedChannels(networkID string, chans []string) error {
	_, err := s.db.Exec(
		`UPDATE networks SET joined_chans=$1 WHERE id=$2`,
		autoJoinToDB(chans), networkID,
	)
	return err
}

// ─── Uploads ──────────────────────────────────────────────────────────────────

// Upload represents a user-uploaded file tracked in the database.
type Upload struct {
	Filename   string
	UploadType string // "photo" or "snippet"
	UploadedAt time.Time
}

// InsertUpload records a newly uploaded file for a user.
func (s *DB) InsertUpload(userID, filename, uploadType string) error {
	_, err := s.db.Exec(
		`INSERT INTO user_uploads (user_id, filename, upload_type) VALUES ($1, $2, $3)`,
		userID, filename, uploadType,
	)
	return err
}

// GetUploadsByUser returns all tracked uploads for a user.
func (s *DB) GetUploadsByUser(userID string) ([]Upload, error) {
	rows, err := s.db.Query(
		`SELECT filename, upload_type, uploaded_at FROM user_uploads WHERE user_id=$1 ORDER BY uploaded_at ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Upload
	for rows.Next() {
		var u Upload
		if err := rows.Scan(&u.Filename, &u.UploadType, &u.UploadedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ─── Utilities ────────────────────────────────────────────────────────────────

func newID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

// autoJoinToDB converts a string slice to a Postgres array literal.
// Returning a plain string avoids driver.Valuer type-conversion issues —
// Postgres casts text → text[] automatically.
func autoJoinToDB(chans []string) string {
	if len(chans) == 0 {
		return "{}"
	}
	out := "{"
	for i, s := range chans {
		if i > 0 {
			out += ","
		}
		out += `"` + escapePostgresString(s) + `"`
	}
	return out + "}"
}

// pqArray returns an sql.Scanner for a Postgres text[] column.
func pqArray(dest *[]string) interface{} {
	return &pgStringArray{dest}
}

// pgStringArray implements sql.Scanner for text[] columns.
type pgStringArray struct{ v *[]string }

func (a *pgStringArray) Scan(src interface{}) error {
	if src == nil {
		*a.v = nil
		return nil
	}
	var s string
	switch v := src.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("pgStringArray: unexpected type %T", src)
	}
	*a.v = parsePostgresArray(s)
	return nil
}

func escapePostgresString(s string) string {
	result := ""
	for _, c := range s {
		if c == '"' || c == '\\' {
			result += "\\"
		}
		result += string(c)
	}
	return result
}

// parsePostgresArray parses a Postgres array literal like {a,b,c} or {"a","b c"}.
func parsePostgresArray(s string) []string {
	if s == "{}" || s == "" {
		return nil
	}
	s = s[1 : len(s)-1] // strip { }
	var result []string
	var cur string
	inQuote := false
	escaped := false
	for _, c := range s {
		if escaped {
			cur += string(c)
			escaped = false
			continue
		}
		if c == '\\' {
			escaped = true
			continue
		}
		if c == '"' {
			inQuote = !inQuote
			continue
		}
		if c == ',' && !inQuote {
			result = append(result, cur)
			cur = ""
			continue
		}
		cur += string(c)
	}
	if cur != "" || len(result) > 0 {
		result = append(result, cur)
	}
	return result
}
