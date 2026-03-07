.PHONY: run build tidy docker up down lint test

run:
	go run ./cmd/server

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/korechat ./cmd/server

tidy:
	go mod tidy

test:
	go test ./...

lint:
	golangci-lint run ./...

docker:
	docker compose build

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f
