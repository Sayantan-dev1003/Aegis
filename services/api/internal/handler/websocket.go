package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"

	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/Sayantan-dev1003/aegis/api/internal/ws"
)



var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	HandshakeTimeout: 10 * time.Second,
}

type WebSocketHandler struct {
	hub         *ws.Hub
	authService *service.AuthService
}

func NewWebSocketHandler(hub *ws.Hub, authService *service.AuthService) *WebSocketHandler {
	return &WebSocketHandler{
		hub:         hub,
		authService: authService,
	}
}

func (h *WebSocketHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "missing token"})
		return
	}

	claims, err := h.authService.ValidateToken(token)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid or expired token"})
		return
	}

	userID, _ := claims["sub"].(string)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		metrics.WSUpgradeFailedTotal.Inc()
		logger.FromContext(r.Context()).Error().Err(err).Msg("failed to upgrade websocket connection")
		return
	}

	client := ws.NewClient(h.hub, conn, userID)
	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
