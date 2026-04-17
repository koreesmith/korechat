package main

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/koree/korechat/internal/auth"
	"github.com/koree/korechat/internal/bnc"
	"github.com/koree/korechat/internal/config"
	"github.com/koree/korechat/internal/handlers"
	"github.com/koree/korechat/internal/hub"
	"github.com/koree/korechat/internal/logging"
	"github.com/koree/korechat/internal/networks"
	"github.com/koree/korechat/internal/store"
	"github.com/koree/korechat/internal/ws"
)

func main() {
	cfg := config.Load()
	log.Printf("KoreChat starting on %s (server: %s)", cfg.HTTPAddr, cfg.ServerName)

	// ── Postgres ──────────────────────────────────────────────────────────────
	db, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer db.Close()

	// ── IRC hub (built-in server mode) ────────────────────────────────────────
	h := hub.New(hub.HubConfig{
		ServerName: cfg.ServerName,
		ServerVer:  cfg.ServerVer,
		MOTD:       cfg.MOTD,
	})

	// ── BNC manager ───────────────────────────────────────────────────────────
	// In-memory status store (network config lives in Postgres; only runtime
	// status — connecting/connected/error — lives in memory).
	ns := networks.NewStore()
	bm := bnc.NewManager(ns)
	bm.SetIRCDebug(cfg.IRCDebug)
	bm.SetPersistChannelsFn(func(networkID string, chans []string) {
		if err := db.SetJoinedChannels(networkID, chans); err != nil {
			log.Printf("bnc: persist joined channels for %s: %v", networkID, err)
		}
	})
	if cfg.IRCDebug {
		log.Println("IRC_DEBUG enabled — raw IRC lines will be logged")
	}

	// Load all networks from DB and start persistent connections
	allNets, err := db.ListAllNetworks()
	if err != nil {
		log.Fatalf("could not load networks: %v", err)
	}

	// ── Message logger ────────────────────────────────────────────────────────
	msgLogger := logging.New(db.RawDB())
	bm.SetLogFunc(msgLogger.Log)

	bm.Start(allNets)

	// ── HTTP ──────────────────────────────────────────────────────────────────
	wsServer := ws.NewServer(h, bm, cfg.ServerName)
	avatarDir  := "/data/avatars"
	uploadDir  := "/data/uploads"
	snippetDir := "/data/snippets"
	api := handlers.NewAPI(h, db, bm, msgLogger, cfg.JWTSecret, cfg.ServerName, avatarDir, uploadDir, snippetDir)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(corsMiddleware)

	// ── Public routes (no auth required) ─────────────────────────────────────
	r.Get("/health", api.Health)
	r.Get("/api/v1/setup", api.SetupStatus)
	r.Post("/api/v1/setup", api.SetupCreate)
	r.Post("/api/v1/auth/login", api.Login)
	// Public avatar lookup — used by frontend to resolve nicks to avatars
	r.Get("/api/v1/users/avatar/{username}", api.GetAvatarByUsername)
	// Serve uploaded avatar files
	r.Handle("/avatars/*", http.StripPrefix("/avatars/", http.FileServer(http.Dir(avatarDir))))
	// Serve uploaded photo files
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))
	// Serve code snippets (public — linked to from IRC messages)
	r.Handle("/snippets/*", http.StripPrefix("/snippets/", http.FileServer(http.Dir(snippetDir))))

	// ── Authenticated routes ──────────────────────────────────────────────────
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(cfg.JWTSecret))

		r.Post("/api/v1/auth/logout", api.Logout)
		r.Get("/api/v1/auth/me", api.Me)

		// Self-service profile
		r.Patch("/api/v1/profile", api.UpdateProfile)
		r.Delete("/api/v1/profile", api.DeleteAccount)
		r.Post("/api/v1/profile/avatar", api.UploadAvatar)

		// Photo and snippet uploads for channel messages
		r.Post("/api/v1/upload/photo", api.UploadPhoto)
		r.Post("/api/v1/upload/snippet", api.UploadSnippet)

		r.Route("/api/v1/networks", func(r chi.Router) {
			r.Get("/", api.ListNetworks)
			r.Post("/", api.CreateNetwork)
			r.Get("/{id}", api.GetNetwork)
			r.Patch("/{id}", api.UpdateNetwork)
			r.Delete("/{id}", api.DeleteNetwork)
			r.Post("/{id}/disconnect", api.DisconnectNetwork)
			r.Post("/{id}/connect", api.ReconnectNetwork)
		})

		// ── Logging routes ────────────────────────────────────────────────────
		r.Route("/api/v1/logs", func(r chi.Router) {
			r.Get("/", api.QueryLogs)
			r.Delete("/", api.DeleteLogs)
			r.Get("/settings", api.GetLogSettings)
			r.Patch("/settings", api.UpdateLogSettings)
			r.Get("/export", api.ExportLogs)
			r.Get("/networks", api.GetLogNetworks)
			r.Get("/channels", api.GetLogChannels)
		})

		// ── User data export ──────────────────────────────────────────────────
		r.Get("/api/v1/export/user-data", api.ExportUserData)

		// ── Admin-only routes ─────────────────────────────────────────────────
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAdmin)
			r.Get("/api/v1/admin/users", api.AdminListUsers)
			r.Post("/api/v1/admin/users", api.AdminCreateUser)
			r.Patch("/api/v1/admin/users/{id}", api.AdminUpdateUser)
			r.Delete("/api/v1/admin/users/{id}", api.AdminDeleteUser)
		})
	})

	// ── WebSocket (auth read from cookie before upgrade) ─────────────────────
	r.Get(cfg.WSPath, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.ClaimsFromRequest(r, cfg.JWTSecret); !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		wsServer.ServeHTTP(w, r)
	})

	log.Printf("Listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
