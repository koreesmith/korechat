package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	ServerName string
	HTTPAddr   string
	WSPath     string
	ServerVer  string
	MOTD       string

	// Auth
	JWTSecret string

	// Postgres
	DatabaseURL string

	// Developer
	IRCDebug bool // log raw IRC lines sent/received
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		ServerName:  getEnv("SERVER_NAME", "korechat.net"),
		HTTPAddr:    getEnv("HTTP_ADDR", ":8080"),
		WSPath:      getEnv("WS_PATH", "/ws"),
		ServerVer:   getEnv("SERVER_VERSION", "KoreChat/1.0"),
		MOTD:        getEnv("MOTD", "Welcome to KoreChat · IRCv3 · Built for teams"),
		JWTSecret:   getEnv("JWT_SECRET", "changeme-please-use-a-long-random-string"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://korechat:korechat@postgres:5432/korechat?sslmode=disable"),
		IRCDebug:    getEnvBool("IRC_DEBUG", false),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			log.Printf("config: invalid int for %s: %v", key, err)
			return def
		}
		return n
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return def
		}
		return b
	}
	return def
}
