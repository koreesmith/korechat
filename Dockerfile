FROM golang:1.22-alpine AS builder

RUN apk --no-cache add git

WORKDIR /app
COPY . .
RUN go mod tidy && go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o korechat ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata netcat-openbsd
WORKDIR /app

COPY --from=builder /app/korechat .
COPY --from=builder /app/.env.example .env

EXPOSE 8080

CMD ["./korechat"]
