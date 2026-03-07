# KoreChat — Go IRCv3 Backend

WebSocket-based IRC server backend for the KoreChat client.  
Each browser tab connects via WebSocket at `/ws` and speaks full IRC protocol over the socket.

## Architecture

```
browser (KoreChat.jsx)
    └── WebSocket (IRC protocol over WS)
         └── ws/ws.go          — WS upgrade, read/write pumps, session lifecycle
              └── irc/handler.go — IRCv3 command dispatch
                   └── hub/hub.go — central state: users, channels, routing
                        └── models/models.go — Channel, User, Member, History
                             └── pkg/ircv3/message.go — parser / formatter / tag escaping
```

## IRCv3 Capabilities Supported

| Capability | Description |
|---|---|
| `multi-prefix` | All prefixes in NAMES (not just highest) |
| `away-notify` | Broadcast AWAY to shared-channel members |
| `account-notify` | Account changes broadcast |
| `extended-join` | JOIN includes account + realname |
| `sasl` | SASL PLAIN authentication (stub — extend for real auth) |
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
| `draft/chathistory` | Per-channel history replay on JOIN |

## Commands

`CAP` `NICK` `USER` `PING/PONG` `JOIN` `PART` `PRIVMSG` `NOTICE` `TOPIC` `NAMES` `LIST` `WHO` `WHOIS` `MODE` `AWAY` `QUIT` `KICK` `INVITE` `CHATHISTORY` `SETNAME`

## Quick Start

```bash
# Copy env
cp .env.example .env

# Run directly
go run ./cmd/server

# Or with Docker
docker compose up -d --build
```

Server listens on `:8080` by default.

- WebSocket: `ws://localhost:8080/ws`
- Health: `http://localhost:8080/health`
- Info API: `http://localhost:8080/api/v1/info`

## Connecting the Frontend

In `KoreChat.jsx`, replace `SimulatedIRCServer` with a real WebSocket:

```js
const ws = new WebSocket("ws://localhost:8080/ws");

ws.onmessage = (e) => {
  e.data.split("\n").filter(Boolean).forEach(line => {
    const msg = parseIRCMessage(line);
    onEvent(msg, line);
  });
};

const send = (raw) => ws.send(raw + "\r\n");
```

Then point `connect()` at this `send` function instead of `SimulatedIRCServer.handle()`.

## Project Structure

```
korechat/
├── cmd/server/main.go          — entrypoint, HTTP router
├── internal/
│   ├── config/config.go        — env-based config
│   ├── models/models.go        — User, Channel, Member, History
│   ├── hub/hub.go              — central broker & state
│   ├── irc/handler.go          — IRC command handlers
│   ├── ws/ws.go                — WebSocket transport
│   ├── auth/auth.go            — JWT middleware
│   └── handlers/api.go         — REST API (health, info)
├── pkg/ircv3/message.go        — IRCv3 parser/formatter
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
| `SERVER_NAME` | `korechat.net` | IRC server name |
| `SERVER_VERSION` | `KoreChat/1.0` | Version string in 002 numeric |
| `MOTD` | `Welcome…` | Message of the Day |
| `JWT_SECRET` | `changeme` | JWT signing secret |
| `IRC_HOST` | `` | Upstream IRC host (proxy mode) |
| `IRC_PORT` | `6667` | Upstream IRC port |
| `IRC_TLS` | `false` | Use TLS for upstream connection |

## Roadmap

- [ ] SASL PLAIN authentication against a user store
- [ ] Postgres persistence for user accounts and channel history
- [ ] IRC proxy mode (upstream connection to real IRC network)
- [ ] TLS listener
- [ ] Rate limiting per session
- [ ] Channel ban/except/invite lists
- [ ] NickServ/ChanServ service bots
