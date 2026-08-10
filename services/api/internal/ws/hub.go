package ws

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mu         sync.RWMutex // for safe reads of client count for metrics
}

func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte, 256),
		Register:   make(chan *Client, 64),
		Unregister: make(chan *Client, 64),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			for client := range h.clients {
				client.Conn.Close()
				delete(h.clients, client)
			}
			return
		case client := <-h.Register:
			h.clients[client] = true
			metrics.WebSocketConnectionsActive.Inc()
			logger.FromContext(ctx).Debug().Str("remote_addr", client.Conn.RemoteAddr().String()).Msg("client registered")
		case client := <-h.Unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.once.Do(func() {
					close(client.Send)
				})
				metrics.WebSocketConnectionsActive.Dec()
				logger.FromContext(ctx).Debug().Str("remote_addr", client.Conn.RemoteAddr().String()).Msg("client unregistered")
			}
		case message := <-h.broadcast:
			metrics.WSMessagesBroadcastTotal.Inc()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					client.once.Do(func() {
						close(client.Send)
					})
					delete(h.clients, client)
					metrics.WebSocketConnectionsActive.Dec()
					metrics.WSSlowClientDisconnectedTotal.Inc()
					logger.FromContext(ctx).Warn().Str("remote_addr", client.Conn.RemoteAddr().String()).Msg("slow client evicted, send buffer full")
				}
			}
		}
	}
}

func (h *Hub) Broadcast(transactionID string, payload interface{}) {
	tracer := otel.Tracer("aegis/api/ws")
	_, span := tracer.Start(context.Background(), "ws_hub.broadcast")
	span.SetAttributes(attribute.String("transaction_id", transactionID))
	defer span.End()

	data, err := json.Marshal(payload)
	if err != nil {
		logger.Get().Error().Err(err).Msg("failed to marshal broadcast payload")
		return
	}
	select {
	case h.broadcast <- data:
	default:
		metrics.WSBroadcastChannelFullTotal.Inc()
		logger.Get().Error().Msg("broadcast channel full, message dropped")
	}
}

// SendToUser sends a message to a specific user by ID
func (h *Hub) SendToUser(userID string, payload interface{}) {
	tracer := otel.Tracer("aegis/api/ws")
	_, span := tracer.Start(context.Background(), "ws_hub.send_to_user")
	span.SetAttributes(attribute.String("user_id", userID))
	defer span.End()

	data, err := json.Marshal(payload)
	if err != nil {
		logger.Get().Error().Err(err).Msg("failed to marshal user notification payload")
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- data:
				metrics.WSMessagesUserTargetedTotal.Inc()
			default:
				client.once.Do(func() {
					close(client.Send)
				})
				delete(h.clients, client)
				metrics.WebSocketConnectionsActive.Dec()
				metrics.WSSlowClientDisconnectedTotal.Inc()
				logger.Get().Warn().Str("user_id", userID).Msg("slow client evicted during user send")
			}
			return
		}
	}
}

// SendToRole sends a message to all connected users with a specific role
func (h *Hub) SendToRole(role string, payload interface{}) {
	tracer := otel.Tracer("aegis/api/ws")
	_, span := tracer.Start(context.Background(), "ws_hub.send_to_role")
	span.SetAttributes(attribute.String("role", role))
	defer span.End()

	data, err := json.Marshal(payload)
	if err != nil {
		logger.Get().Error().Err(err).Msg("failed to marshal role notification payload")
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.Role == role {
			select {
			case client.Send <- data:
				metrics.WSMessagesUserTargetedTotal.Inc() // Could create a new metric for role broadcasts
			default:
				client.once.Do(func() {
					close(client.Send)
				})
				delete(h.clients, client)
				metrics.WebSocketConnectionsActive.Dec()
				metrics.WSSlowClientDisconnectedTotal.Inc()
				logger.Get().Warn().Str("role", role).Str("user_id", client.UserID).Msg("slow client evicted during role send")
			}
		}
	}
}
