// Package auth provides JWT httpOnly cookie authentication for KoreChat.
package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	cookieName    = "kc_session"
	cookieTTL     = 30 * 24 * time.Hour // 30 days
	// Refresh the token when less than this much time remains.
	// Ensures active sessions never expire without a login.
	refreshWindow = 7 * 24 * time.Hour
)

type contextKey string

const claimsKey contextKey = "claims"

// Claims are the JWT payload stored in the httpOnly cookie.
type Claims struct {
	UserID      string `json:"uid"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	jwt.RegisteredClaims
}

// IssueToken creates a signed JWT and sets it as an httpOnly cookie.
func IssueToken(w http.ResponseWriter, secret, userID, username, displayName, role string) error {
	claims := &Claims{
		UserID:      userID,
		Username:    username,
		DisplayName: displayName,
		Role:        role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(cookieTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID,
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    signed,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(cookieTTL.Seconds()),
		// Secure: true — enable this when serving over HTTPS
	})
	return nil
}

// ClearToken deletes the session cookie.
func ClearToken(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// parseToken extracts and validates the JWT from the request cookie.
func parseToken(r *http.Request, secret string) (*Claims, error) {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return nil, err
	}
	tok, err := jwt.ParseWithClaims(cookie.Value, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return nil, jwt.ErrSignatureInvalid
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

// Middleware validates the session cookie on every request and silently
// refreshes it when it is within refreshWindow of expiry. This keeps
// active sessions alive indefinitely without requiring re-login.
func Middleware(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, err := parseToken(r, secret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			// Refresh token if it expires within the refresh window.
			if claims.ExpiresAt != nil && time.Until(claims.ExpiresAt.Time) < refreshWindow {
				_ = IssueToken(w, secret, claims.UserID, claims.Username, claims.DisplayName, claims.Role)
			}
			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAdmin is a middleware that additionally enforces the admin role.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := ClaimsFromCtx(r.Context())
		if !ok || claims.Role != "admin" {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ClaimsFromCtx retrieves Claims from a request context.
func ClaimsFromCtx(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok
}

// ClaimsFromRequest extracts claims without failing the request —
// used by the WS upgrade which needs to read the cookie before upgrading.
func ClaimsFromRequest(r *http.Request, secret string) (*Claims, bool) {
	c, err := parseToken(r, secret)
	if err != nil {
		return nil, false
	}
	return c, true
}
