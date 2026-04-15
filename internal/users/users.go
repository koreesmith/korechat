// Package users defines the KoreChat user model and role system.
package users

import (
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Role controls what a user can do in the application.
type Role string

const (
	RoleAdmin Role = "admin" // full access including user management
	RoleUser  Role = "user"  // normal user: manage own networks/settings
)

// User is a KoreChat application account.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"` // never serialised to JSON
	DisplayName  string    `json:"display_name"`
	AvatarURL    string    `json:"avatar_url"`
	Theme        string    `json:"theme"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SetPassword hashes and stores a plaintext password.
func (u *User) SetPassword(plain string) error {
	if len(plain) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	return nil
}

// CheckPassword returns true if the plaintext matches the stored hash.
func (u *User) CheckPassword(plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(plain)) == nil
}

// IsAdmin returns true for admin-role users.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// Safe returns a copy with the password hash cleared — safe to send to clients.
func (u *User) Safe() *User {
	cp := *u
	cp.PasswordHash = ""
	return &cp
}
