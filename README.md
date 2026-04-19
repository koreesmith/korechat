# KoreChat

A self-hosted IRC bouncer (BNC) with a modern web frontend. Connect to any IRC network and access your conversations from any browser — persistent connections, message history, multi-user support, and a full admin panel included.

## Features

- **IRC Bouncer** — persistent upstream connections survive browser disconnects; replay history on reconnect
- **IRCv3** — full capability negotiation with 15+ IRCv3 caps supported
- **Multi-user** — user accounts with roles (admin/user), registration flow, avatar uploads
- **Message logging** — per-network searchable logs with export
- **Web frontend** — React single-page app served via nginx, PWA-ready
- **Admin panel** — manage users, view connections, monitor networks
- **Docker Compose** — single command to get the full stack running

## Architecture

```
browser (frontend/app.jsx)
    └── REST API + WebSocket (/api/v1, /ws)
         └── cmd/server/main.go       — HTTP router, entrypoint
              ├── internal/auth/      — JWT middleware (httpOnly cookie)
              ├── internal/handlers/  — REST API (auth, users, networks, logs, admin)
              ├── internal/ws/        — WebSocket transport, session lifecycle
              ├── internal/hub/       — central IRC state: users, channels, routing
              ├── internal/irc/       — IRCv3 command dispatcher
              ├── internal/bnc/       — bouncer: persistent upstream IRC connections
              ├── internal/proxy/     — IRC proxy mode (pass-through)
              ├── internal/store/     — Postgres persistence
              ├── internal/logging/   — message log storage and search
              ├── internal/networks/  — IRC network model
              ├── internal/users/     — user model (bcrypt passwords)
              ├── internal/models/    — Channel, Member, History
              └── pkg/ircv3/          — IRCv3 parser, formatter, tag escaping
```

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
#    Edit .env — set JWT_SECRET and DATABASE_URL password

# 2. Start the stack
docker compose up -d --build

# 3. Open http://localhost and complete first-run setup
```

The setup wizard runs on first boot to create the admin account.

## Project Structure

```
korechat/
├── cmd/server/main.go              — entrypoint, HTTP router
├── internal/
│   ├── auth/auth.go                — JWT issue/validate/refresh
│   ├── bnc/                        — bouncer connection manager
│   ├── config/config.go            — env-based config
│   ├── handlers/api.go             — REST API handlers
│   ├── hub/hub.go                  — central IRC broker & state
│   ├── irc/handler.go              — IRC command handlers
│   ├── logging/logger.go           — message logging
│   ├── models/models.go            — core IRC data models
│   ├── networks/network.go         — IRC network type
│   ├── proxy/proxy.go              — IRC proxy mode
│   ├── store/store.go              — Postgres queries
│   ├── users/users.go              — user type, bcrypt helpers
│   └── ws/ws.go                    — WebSocket transport
├── pkg/ircv3/message.go            — IRCv3 parser/formatter
├── frontend/
│   ├── app.jsx                     — React single-page app
│   ├── index.html
│   ├── nginx.conf                  — frontend nginx config
│   ├── Dockerfile.frontend
│   ├── sw.js                       — service worker (PWA)
│   └── manifest.json
├── deploy/
│   └── nginx-reverse-proxy.example.conf
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HTTP_ADDR` | `:8080` | HTTP/WS listen address |
| `WS_PATH` | `/ws` | WebSocket endpoint path |
| `SERVER_NAME` | `korechat.net` | IRC server name in numerics |
| `SERVER_VERSION` | `KoreChat/1.0` | Version string in 002 numeric |
| `MOTD` | `Welcome…` | Message of the Day |
| `JWT_SECRET` | — | JWT signing secret — **required in production** (`openssl rand -hex 32`) |
| `DATABASE_URL` | — | Postgres connection string |
| `IRC_DEBUG` | `false` | Log raw IRC lines to stdout |
| `FRONTEND_PORT` | `80` | Host port for the nginx frontend |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/setup` | First-run admin account creation |
| `POST` | `/api/v1/auth/login` | Login |
| `POST` | `/api/v1/auth/logout` | Logout |
| `GET` | `/api/v1/auth/me` | Current user info |
| `GET/PATCH` | `/api/v1/profile` | User profile & password change |
| `DELETE` | `/api/v1/profile` | Delete own account |
| `GET/POST` | `/api/v1/networks` | List / add IRC networks |
| `PATCH/DELETE` | `/api/v1/networks/:id` | Update / remove network |
| `POST` | `/api/v1/networks/:id/connect` | Connect bouncer to network |
| `POST` | `/api/v1/networks/:id/disconnect` | Disconnect bouncer from network |
| `GET` | `/api/v1/logs` | Search message logs |
| `DELETE` | `/api/v1/logs` | Clear logs |
| `GET` | `/api/v1/logs/export` | Export logs |
| `GET/PATCH` | `/api/v1/logs/settings` | Log settings |
| `GET` | `/api/v1/export/user-data` | Export all user data |
| `GET/POST/PATCH/DELETE` | `/api/v1/admin/users` | Admin user management |
| `GET` | `/health` | Health check |
| `WS` | `/ws` | IRC WebSocket connection |

## IRCv3 Capabilities

| Capability | Description |
|---|---|
| `multi-prefix` | All prefixes in NAMES (not just highest) |
| `away-notify` | AWAY broadcast to shared-channel members |
| `account-notify` | Account changes broadcast |
| `extended-join` | JOIN includes account + realname |
| `sasl` | SASL PLAIN authentication |
| `server-time` | `time=` tag on all outgoing messages |
| `message-tags` | Client-supplied `+tags` forwarded |
| `batch` | Batch support (NAMES, history) |
| `labeled-response` | Request/reply correlation via `label=` tag |
| `echo-message` | Sender receives their own PRIVMSG back |
| `invite-notify` | Ops notified of INVITE events |
| `cap-notify` | Runtime capability changes |
| `userhost-in-names` | NAMES includes user@host |
| `chghost` | Host changes broadcast as CHGHOST |
| `setname` | Realname changes via SETNAME |
| `draft/chathistory` | Per-channel history replay |

## IRC Commands

`CAP` `NICK` `USER` `PING` `PONG` `JOIN` `PART` `PRIVMSG` `NOTICE` `TOPIC` `NAMES` `LIST` `WHO` `WHOIS` `MODE` `AWAY` `QUIT` `KICK` `INVITE` `CHATHISTORY` `SETNAME` `OPER`
