package service

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// AuthService handles authentication logic.
type AuthService struct {
	jwtSecret  []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewAuthService creates a new AuthService.
func NewAuthService(secret string, accessTTL, refreshTTL time.Duration) *AuthService {
	return &AuthService{
		jwtSecret:  []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

// HashPassword hashes a plain text password using bcrypt.
func (s *AuthService) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword verifies a password against a hash.
func (s *AuthService) CheckPassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// GenerateAccessToken generates a short-lived JWT for API access.
func (s *AuthService) GenerateAccessToken(analystID, role string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  analystID,
		"role": role,
		"type": "access",
		"exp":  time.Now().Add(s.accessTTL).Unix(),
		"iat":  time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// GenerateRefreshToken generates a longer-lived JWT for obtaining new access tokens.
func (s *AuthService) GenerateRefreshToken(analystID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  analystID,
		"type": "refresh",
		"exp":  time.Now().Add(s.refreshTTL).Unix(),
		"iat":  time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ValidateToken parses and validates a JWT token string.
func (s *AuthService) ValidateToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Ensure the signing method is what we expect
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}
