package handler

import (
	"context"
	"net/http"
)

// auditContext extracts the IP address and User-Agent from the HTTP request
// and returns a background context that carries those values so they can be
// stored in audit logs even when the audit write is dispatched in a goroutine.
func auditContext(r *http.Request) context.Context {
	// context.WithoutCancel keeps all context values (like logger, AnalystInfo, RequestInfo)
	// but prevents the background operation from being cancelled when the HTTP request ends.
	return context.WithoutCancel(r.Context())
}
