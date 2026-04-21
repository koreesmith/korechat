// Package handlers provides the REST API surface for KoreChat.
package handlers

import (
	"archive/zip"
	"crypto/rand"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/koree/korechat/internal/auth"
	"github.com/koree/korechat/internal/bnc"
	"github.com/koree/korechat/internal/hub"
	"github.com/koree/korechat/internal/logging"
	"github.com/koree/korechat/internal/networks"
	"github.com/koree/korechat/internal/store"
	"github.com/koree/korechat/internal/users"
)

type API struct {
	hub        *hub.Hub
	store      *store.DB
	bncMgr     *bnc.Manager
	logger     *logging.Logger
	jwtSecret  string
	srvName    string
	startedAt  time.Time
	avatarDir  string
	uploadDir  string
	snippetDir string
}

func NewAPI(h *hub.Hub, s *store.DB, bm *bnc.Manager, logger *logging.Logger, jwtSecret, serverName, avatarDir, uploadDir, snippetDir string) *API {
	return &API{
		hub:        h,
		store:      s,
		bncMgr:     bm,
		logger:     logger,
		jwtSecret:  jwtSecret,
		srvName:    serverName,
		startedAt:  time.Now(),
		avatarDir:  avatarDir,
		uploadDir:  uploadDir,
		snippetDir: snippetDir,
	}
}

// ─── Health ───────────────────────────────────────────────────────────────────

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"server":  a.srvName,
		"uptime":  time.Since(a.startedAt).String(),
		"version": "KoreChat/1.0",
	})
}

// ─── Setup ────────────────────────────────────────────────────────────────────

// SetupStatus GET /api/v1/setup
// Returns {"needed": true} if no users exist yet, {"needed": false} otherwise.
func (a *API) SetupStatus(w http.ResponseWriter, r *http.Request) {
	needed, err := a.store.NeedsSetup()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"needed": needed})
}

// SetupCreate POST /api/v1/setup
// Creates the first admin user. Fails if any user already exists.
func (a *API) SetupCreate(w http.ResponseWriter, r *http.Request) {
	// Guard: only allowed when no users exist
	needed, err := a.store.NeedsSetup()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database error")
		return
	}
	if !needed {
		writeErr(w, http.StatusForbidden, "setup already completed")
		return
	}

	var body struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Username == "" || body.Password == "" {
		writeErr(w, http.StatusUnprocessableEntity, "username and password are required")
		return
	}

	u := &users.User{
		Username:    body.Username,
		DisplayName: body.DisplayName,
		Role:        users.RoleAdmin,
	}
	if err := u.SetPassword(body.Password); err != nil {
		writeErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	created, err := a.store.CreateUser(u)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create user: "+err.Error())
		return
	}

	// Issue session cookie immediately — admin is logged in after setup
	if err := auth.IssueToken(w, a.jwtSecret,
		created.ID, created.Username, created.DisplayName, string(created.Role),
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not issue session")
		return
	}

	log.Printf("setup: first admin user created: %s", created.Username)
	writeJSON(w, http.StatusCreated, created.Safe())
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Login POST /api/v1/auth/login
func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	u, err := a.store.GetUserByUsername(body.Username)
	if err != nil || !u.CheckPassword(body.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	if err := auth.IssueToken(w, a.jwtSecret,
		u.ID, u.Username, u.DisplayName, string(u.Role),
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not issue session")
		return
	}
	writeJSON(w, http.StatusOK, u.Safe())
}

// Logout POST /api/v1/auth/logout
func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	auth.ClearToken(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

// Me GET /api/v1/auth/me
func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	u, err := a.store.GetUserByID(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u.Safe())
}

// ─── Networks (per-user) ──────────────────────────────────────────────────────

// ListNetworks GET /api/v1/networks
func (a *API) ListNetworks(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	nets, err := a.store.ListNetworks(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if nets == nil {
		nets = []*networks.Network{}
	}
	// Overlay live BNC status
	for _, n := range nets {
		n.Status = a.bncMgr.NetworkStatus(n.ID)
	}
	writeJSON(w, http.StatusOK, nets)
}

// CreateNetwork POST /api/v1/networks
func (a *API) CreateNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	var n networks.Network
	if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if err := n.Validate(); err != nil {
		writeErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	created, err := a.store.CreateNetwork(claims.UserID, &n)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.bncMgr.AddNetwork(created)
	writeJSON(w, http.StatusCreated, created)
}

// GetNetwork GET /api/v1/networks/{id}
func (a *API) GetNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")
	n, err := a.store.GetNetwork(claims.UserID, id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "network not found")
		return
	}
	n.Status = a.bncMgr.NetworkStatus(n.ID)
	writeJSON(w, http.StatusOK, n)
}

// UpdateNetwork PATCH /api/v1/networks/{id}
func (a *API) UpdateNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	var patch networks.Network
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	updated, err := a.store.UpdateNetwork(claims.UserID, id, &patch)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	// Restart the persistent BNC connection so new settings (TLS, SASL, host, etc.) take effect.
	a.bncMgr.RestartNetwork(updated)
	writeJSON(w, http.StatusOK, updated)
}

// DeleteNetwork DELETE /api/v1/networks/{id}
func (a *API) DeleteNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	if err := a.store.DeleteNetwork(claims.UserID, id); err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	a.bncMgr.RemoveNetwork(id)
	w.WriteHeader(http.StatusNoContent)
}

// DisconnectNetwork POST /api/v1/networks/{id}/disconnect
func (a *API) DisconnectNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	if _, err := a.store.GetNetwork(claims.UserID, id); err != nil {
		writeErr(w, http.StatusNotFound, "network not found")
		return
	}
	a.bncMgr.DisconnectNetwork(id)
	w.WriteHeader(http.StatusNoContent)
}

// ReconnectNetwork POST /api/v1/networks/{id}/connect
func (a *API) ReconnectNetwork(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	n, err := a.store.GetNetwork(claims.UserID, id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "network not found")
		return
	}
	a.bncMgr.ReconnectNetwork(n)
	w.WriteHeader(http.StatusNoContent)
}

// ─── Profile (self-service) ───────────────────────────────────────────────────

// UpdateProfile PATCH /api/v1/profile
// Allows a user to change their own password (current password required).
func (a *API) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	var body struct {
		CurrentPassword     string `json:"current_password"`
		NewPassword         string `json:"new_password"`
		DisplayName         string `json:"display_name"`
		Theme               string `json:"theme"`
		SidebarCollapsed    string `json:"sidebar_collapsed"`
		SidebarNetworkOrder string `json:"sidebar_network_order"`
		SidebarStarred      string `json:"sidebar_starred"`
		SidebarMuted        string `json:"sidebar_muted"`
		DefaultChannels     string `json:"default_channels"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	u, err := a.store.GetUserByID(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}

	patch := &users.User{}

	if body.DisplayName != "" {
		patch.DisplayName = body.DisplayName
	}

	if body.Theme != "" {
		patch.Theme = body.Theme
	}

	if body.SidebarCollapsed != "" {
		patch.SidebarCollapsed = body.SidebarCollapsed
	}

	if body.SidebarNetworkOrder != "" {
		patch.SidebarNetworkOrder = body.SidebarNetworkOrder
	}

	if body.SidebarStarred != "" {
		patch.SidebarStarred = body.SidebarStarred
	}

	if body.SidebarMuted != "" {
		patch.SidebarMuted = body.SidebarMuted
	}

	if body.DefaultChannels != "" {
		patch.DefaultChannels = body.DefaultChannels
	}

	if body.NewPassword != "" {
		if !u.CheckPassword(body.CurrentPassword) {
			writeErr(w, http.StatusForbidden, "current password is incorrect")
			return
		}
		if err := patch.SetPassword(body.NewPassword); err != nil {
			writeErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}

	updated, err := a.store.UpdateUser(claims.UserID, patch)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated.Safe())
}

// DeleteAccount DELETE /api/v1/profile
// Allows a user to permanently delete their own account and all associated data.
// Requires password confirmation. Disconnects all BNC networks, removes the avatar
// file from disk, deletes the DB record (cascades to networks, logs, log_settings),
// and clears the session cookie.
func (a *API) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		writeErr(w, http.StatusBadRequest, "password is required")
		return
	}

	u, err := a.store.GetUserByID(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}
	if !u.CheckPassword(body.Password) {
		writeErr(w, http.StatusForbidden, "password is incorrect")
		return
	}

	// Disconnect and remove all BNC connections for this user.
	nets, _ := a.store.ListNetworks(claims.UserID)
	for _, n := range nets {
		a.bncMgr.RemoveNetwork(n.ID)
	}

	// Remove avatar file from disk.
	if u.AvatarURL != "" {
		avatarFile := filepath.Join(a.avatarDir, filepath.Base(u.AvatarURL))
		_ = os.Remove(avatarFile)
	}

	// Remove uploaded photos and snippets from disk.
	if uploads, err := a.store.GetUploadsByUser(claims.UserID); err == nil {
		for _, up := range uploads {
			switch up.UploadType {
			case "photo":
				_ = os.Remove(filepath.Join(a.uploadDir, up.Filename))
			case "snippet":
				_ = os.Remove(filepath.Join(a.snippetDir, up.Filename))
			}
		}
	}

	// Delete user record — DB cascades remove networks, message_logs, log_settings, user_uploads.
	if err := a.store.DeleteUser(claims.UserID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	auth.ClearToken(w)
	w.WriteHeader(http.StatusNoContent)
}

// UploadAvatar POST /api/v1/profile/avatar
// Accepts a multipart/form-data upload with field "avatar".
// Stores the file under avatarDir/{userID}.{ext} and saves the URL in the DB.
func (a *API) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	if err := r.ParseMultipartForm(4 << 20); err != nil { // 4 MB limit
		writeErr(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing avatar field")
		return
	}
	defer file.Close()

	// Validate content type
	ct := header.Header.Get("Content-Type")
	var ext string
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		ext = "jpg"
	case strings.HasPrefix(ct, "image/png"):
		ext = "png"
	case strings.HasPrefix(ct, "image/gif"):
		ext = "gif"
	case strings.HasPrefix(ct, "image/webp"):
		ext = "webp"
	default:
		writeErr(w, http.StatusUnsupportedMediaType, "avatar must be jpeg, png, gif, or webp")
		return
	}

	if err := os.MkdirAll(a.avatarDir, 0755); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create avatar directory")
		return
	}

	filename := fmt.Sprintf("%s.%s", claims.UserID, ext)
	destPath := filepath.Join(a.avatarDir, filename)

	// Remove any existing avatar for this user (different extension)
	for _, oldExt := range []string{"jpg", "png", "gif", "webp"} {
		if oldExt != ext {
			os.Remove(filepath.Join(a.avatarDir, fmt.Sprintf("%s.%s", claims.UserID, oldExt)))
		}
	}

	dest, err := os.Create(destPath)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save avatar")
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not write avatar")
		return
	}

	avatarURL := "/avatars/" + filename
	updated, err := a.store.SetAvatarURL(claims.UserID, avatarURL)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update avatar URL")
		return
	}
	log.Printf("avatar: user %s uploaded %s", claims.UserID, filename)
	writeJSON(w, http.StatusOK, updated.Safe())
}

// UploadPhoto POST /api/v1/upload/photo
// Accepts a multipart/form-data upload with field "photo".
// Stores the file under uploadDir and returns the public URL.
func (a *API) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB limit
		writeErr(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing photo field")
		return
	}
	defer file.Close()

	ct := header.Header.Get("Content-Type")
	var ext string
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		ext = "jpg"
	case strings.HasPrefix(ct, "image/png"):
		ext = "png"
	case strings.HasPrefix(ct, "image/gif"):
		ext = "gif"
	case strings.HasPrefix(ct, "image/webp"):
		ext = "webp"
	default:
		writeErr(w, http.StatusUnsupportedMediaType, "photo must be jpeg, png, gif, or webp")
		return
	}

	if err := os.MkdirAll(a.uploadDir, 0755); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create upload directory")
		return
	}

	var randBytes [8]byte
	if _, err := rand.Read(randBytes[:]); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not generate filename")
		return
	}
	filename := fmt.Sprintf("%s-%x.%s", claims.UserID, randBytes, ext)
	destPath := filepath.Join(a.uploadDir, filename)

	dest, err := os.Create(destPath)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save photo")
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not write photo")
		return
	}

	photoURL := "/uploads/" + filename
	_ = a.store.InsertUpload(claims.UserID, filename, "photo")
	log.Printf("upload: user %s uploaded photo %s", claims.UserID, filename)
	writeJSON(w, http.StatusOK, map[string]string{"url": photoURL})
}

// UploadSnippet POST /api/v1/upload/snippet
// Accepts a form field "code" (plain text) and optional "lang" (language hint).
// Stores the snippet under snippetDir and returns the public URL with ?lang=.
func (a *API) UploadSnippet(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	if err := r.ParseMultipartForm(1 << 20); err != nil { // 1 MB limit
		writeErr(w, http.StatusBadRequest, "snippet too large or invalid form")
		return
	}

	code := r.FormValue("code")
	if code == "" {
		writeErr(w, http.StatusBadRequest, "missing code field")
		return
	}
	lang := strings.TrimSpace(r.FormValue("lang"))

	if err := os.MkdirAll(a.snippetDir, 0755); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create snippet directory")
		return
	}

	var randBytes [8]byte
	if _, err := rand.Read(randBytes[:]); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not generate filename")
		return
	}
	filename := fmt.Sprintf("%s-%x", claims.UserID, randBytes)
	destPath := filepath.Join(a.snippetDir, filename)

	if err := os.WriteFile(destPath, []byte(code), 0644); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save snippet")
		return
	}

	snippetURL := "/snippets/" + filename
	if lang != "" {
		snippetURL += "?lang=" + lang
	}
	_ = a.store.InsertUpload(claims.UserID, filename, "snippet")
	log.Printf("upload: user %s uploaded snippet %s (lang=%s)", claims.UserID, filename, lang)
	writeJSON(w, http.StatusOK, map[string]string{"url": snippetURL})
}

// GetAvatarByUsername GET /api/v1/users/avatar/{username}  (public, no auth)
// Resolves an IRC nick or KoreChat username to an avatar URL.
// Lookup order: (1) exact username match, (2) configured IRC nick match.
func (a *API) GetAvatarByUsername(w http.ResponseWriter, r *http.Request) {
	lookup := chi.URLParam(r, "username")

	u, err := a.store.GetUserByUsername(lookup)
	if err != nil {
		// Fall back: maybe the caller passed an IRC nick, not the KoreChat username
		u, err = a.store.GetUserByIRCNick(lookup)
		if err != nil {
			writeErr(w, http.StatusNotFound, "user not found")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"avatar_url": u.AvatarURL, "username": u.Username})
}

// ─── Admin: User management ───────────────────────────────────────────────────

// AdminListUsers GET /api/v1/admin/users
func (a *API) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	us, err := a.store.ListUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	safe := make([]*users.User, len(us))
	for i, u := range us {
		safe[i] = u.Safe()
	}
	writeJSON(w, http.StatusOK, safe)
}

// AdminCreateUser POST /api/v1/admin/users
func (a *API) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Username == "" || body.Password == "" {
		writeErr(w, http.StatusUnprocessableEntity, "username and password are required")
		return
	}
	role := users.RoleUser
	if body.Role == string(users.RoleAdmin) {
		role = users.RoleAdmin
	}
	u := &users.User{
		Username:    body.Username,
		DisplayName: body.DisplayName,
		Role:        role,
	}
	if err := u.SetPassword(body.Password); err != nil {
		writeErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	created, err := a.store.CreateUser(u)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create user: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created.Safe())
}

// AdminUpdateUser PATCH /api/v1/admin/users/{id}
func (a *API) AdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
		Password    string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	patch := &users.User{
		DisplayName: body.DisplayName,
	}
	if body.Role == string(users.RoleAdmin) || body.Role == string(users.RoleUser) {
		patch.Role = users.Role(body.Role)
	}
	if body.Password != "" {
		if err := patch.SetPassword(body.Password); err != nil {
			writeErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}
	updated, err := a.store.UpdateUser(id, patch)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated.Safe())
}

// AdminDeleteUser DELETE /api/v1/admin/users/{id}
func (a *API) AdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	// Prevent self-deletion
	if id == claims.UserID {
		writeErr(w, http.StatusForbidden, "cannot delete your own account")
		return
	}
	// Prevent deleting the last admin
	if err := a.store.DeleteUser(id); err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Logging API ─────────────────────────────────────────────────────────────

// GetLogSettings GET /api/v1/logs/settings
func (a *API) GetLogSettings(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	s, err := a.logger.GetSettings(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// UpdateLogSettings PATCH /api/v1/logs/settings
func (a *API) UpdateLogSettings(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	var s logging.Settings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if s.RetentionDays < 0 {
		writeErr(w, http.StatusBadRequest, "retention_days must be >= 0")
		return
	}
	if err := a.logger.UpsertSettings(claims.UserID, &s); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// QueryLogs GET /api/v1/logs
func (a *API) QueryLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	q := r.URL.Query()

	p := logging.QueryParams{
		NetworkID: q.Get("network_id"),
		Channel:   q.Get("channel"),
		Nick:      q.Get("nick"),
		Search:    q.Get("search"),
		MsgType:   q.Get("type"),
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			p.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			p.Offset = n
		}
	}
	if v := q.Get("date_from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateFrom = t
		}
	}
	if v := q.Get("date_to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateTo = t.Add(24*time.Hour - time.Second)
		}
	}
	// date_to_iso accepts a full ISO-8601 datetime as the upper bound.
	// Used by the frontend to fetch only history older than existing messages.
	if v := q.Get("date_to_iso"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			p.DateTo = t
		} else if t, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
			p.DateTo = t
		}
	}
	// `since` accepts an ISO-8601 datetime — returns entries strictly after that timestamp.
	// Used by the frontend to fetch "what did we miss since our last log entry".
	if v := q.Get("since"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			p.DateFrom = t.Add(time.Millisecond) // strictly after
		} else if t, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
			p.DateFrom = t.Add(time.Millisecond)
		}
	}

	if q.Get("order") == "asc" {
		p.Ascending = true
	}
	if q.Get("server_only") == "true" {
		p.ServerOnly = true
	}
	if q.Get("membership_only") == "true" {
		p.MembershipOnly = true
	}
	result, err := a.logger.Query(claims.UserID, p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ExportLogs GET /api/v1/logs/export  → CSV download
func (a *API) ExportLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	q := r.URL.Query()

	p := logging.QueryParams{
		NetworkID: q.Get("network_id"),
		Channel:   q.Get("channel"),
		Nick:      q.Get("nick"),
		Search:    q.Get("search"),
		MsgType:   q.Get("type"),
	}
	if v := q.Get("date_from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateFrom = t
		}
	}
	if v := q.Get("date_to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateTo = t.Add(24*time.Hour - time.Second)
		}
	}
	// date_to_iso accepts a full ISO-8601 datetime as the upper bound.
	// Used by the frontend to fetch only history older than existing messages.
	if v := q.Get("date_to_iso"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			p.DateTo = t
		} else if t, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
			p.DateTo = t
		}
	}
	// `since` accepts an ISO-8601 datetime — returns entries strictly after that timestamp.
	// Used by the frontend to fetch "what did we miss since our last log entry".
	if v := q.Get("since"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			p.DateFrom = t.Add(time.Millisecond) // strictly after
		} else if t, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
			p.DateFrom = t.Add(time.Millisecond)
		}
	}

	entries, err := a.logger.QueryAll(claims.UserID, p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	filename := "korechat-logs-" + time.Now().Format("2006-01-02") + ".csv"
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"timestamp", "network", "channel", "nick", "type", "text"})
	for _, e := range entries {
		_ = cw.Write([]string{
			e.Timestamp.UTC().Format(time.RFC3339),
			e.NetworkName,
			e.Channel,
			e.Nick,
			e.Type,
			e.Text,
		})
	}
	cw.Flush()
}

// GetLogNetworks GET /api/v1/logs/networks
func (a *API) GetLogNetworks(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	nets, err := a.logger.Networks(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if nets == nil {
		nets = []map[string]string{}
	}
	writeJSON(w, http.StatusOK, nets)
}

// GetLogChannels GET /api/v1/logs/channels?network_id=xxx
func (a *API) GetLogChannels(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	netID := r.URL.Query().Get("network_id")
	chans, err := a.logger.Channels(claims.UserID, netID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chans == nil {
		chans = []string{}
	}
	writeJSON(w, http.StatusOK, chans)
}

// DeleteLogs DELETE /api/v1/logs
func (a *API) DeleteLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())
	n, err := a.logger.DeleteAll(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"deleted": n})
}

// ExportUserData GET /api/v1/export/user-data  → zip download of all user data
func (a *API) ExportUserData(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromCtx(r.Context())

	user, err := a.store.GetUserByID(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load user: "+err.Error())
		return
	}

	nets, err := a.store.ListNetworks(claims.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load networks: "+err.Error())
		return
	}

	logs, err := a.logger.QueryAll(claims.UserID, logging.QueryParams{})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load logs: "+err.Error())
		return
	}

	filename := "korechat-export-" + time.Now().Format("2006-01-02") + ".zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	zw := zip.NewWriter(w)
	defer zw.Close()

	// profile.json — safe user data (no password hash)
	type profileExport struct {
		ID          string    `json:"id"`
		Username    string    `json:"username"`
		DisplayName string    `json:"display_name"`
		AvatarURL   string    `json:"avatar_url"`
		Role        string    `json:"role"`
		Theme       string    `json:"theme"`
		CreatedAt   time.Time `json:"created_at"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	profile := profileExport{
		ID:          user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		AvatarURL:   user.AvatarURL,
		Role:        string(user.Role),
		Theme:       user.Theme,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}
	if pf, err := zw.Create("profile.json"); err == nil {
		enc := json.NewEncoder(pf)
		enc.SetIndent("", "  ")
		_ = enc.Encode(profile)
	}

	// networks.json — IRC network configs (credentials omitted)
	type networkExport struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		Host      string    `json:"host"`
		Port      int       `json:"port"`
		TLS       bool      `json:"tls"`
		Nick      string    `json:"nick"`
		AltNick   string    `json:"alt_nick"`
		Username  string    `json:"username"`
		Realname  string    `json:"realname"`
		AutoJoin  []string  `json:"auto_join"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	netExports := make([]networkExport, 0, len(nets))
	for _, n := range nets {
		netExports = append(netExports, networkExport{
			ID:        n.ID,
			Name:      n.Name,
			Host:      n.Host,
			Port:      n.Port,
			TLS:       n.TLS,
			Nick:      n.Nick,
			AltNick:   n.AltNick,
			Username:  n.Username,
			Realname:  n.Realname,
			AutoJoin:  n.AutoJoin,
			CreatedAt: n.CreatedAt,
			UpdatedAt: n.UpdatedAt,
		})
	}
	if nf, err := zw.Create("networks.json"); err == nil {
		enc := json.NewEncoder(nf)
		enc.SetIndent("", "  ")
		_ = enc.Encode(netExports)
	}

	// message_logs.csv
	if lf, err := zw.Create("message_logs.csv"); err == nil {
		cw := csv.NewWriter(lf)
		_ = cw.Write([]string{"timestamp", "network", "channel", "nick", "type", "text"})
		for _, e := range logs {
			_ = cw.Write([]string{
				e.Timestamp.UTC().Format(time.RFC3339),
				e.NetworkName,
				e.Channel,
				e.Nick,
				e.Type,
				e.Text,
			})
		}
		cw.Flush()
	}

	// avatar file (if present on disk)
	if user.AvatarURL != "" {
		// AvatarURL is like "/avatars/usr-xxx.jpg" — resolve to disk path
		avatarFile := filepath.Join(a.avatarDir, filepath.Base(user.AvatarURL))
		if f, err := os.Open(avatarFile); err == nil {
			defer f.Close()
			if af, err := zw.Create("avatar" + filepath.Ext(user.AvatarURL)); err == nil {
				_, _ = io.Copy(af, f)
			}
		}
	}

	// uploaded photos and snippets
	if uploads, err := a.store.GetUploadsByUser(claims.UserID); err == nil {
		for _, up := range uploads {
			var diskPath, zipPath string
			switch up.UploadType {
			case "photo":
				diskPath = filepath.Join(a.uploadDir, up.Filename)
				zipPath = "uploads/" + up.Filename
			case "snippet":
				diskPath = filepath.Join(a.snippetDir, up.Filename)
				zipPath = "snippets/" + up.Filename
			default:
				continue
			}
			if f, err := os.Open(diskPath); err == nil {
				if zf, err := zw.Create(zipPath); err == nil {
					_, _ = io.Copy(zf, f)
				}
				f.Close()
			}
		}
	}
}

// ─── Utility ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
