package ws

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 25 * time.Second
	maxMessageSize = 512
	SendBufferSize = 256
)

type Client struct {
	hub         *Hub
	Conn        *websocket.Conn
	Send        chan []byte
	once        sync.Once
	userID      string
	connectedAt time.Time
}

func NewClient(hub *Hub, conn *websocket.Conn, userID string) *Client {
	return &Client{
		hub:         hub,
		Conn:        conn,
		Send:        make(chan []byte, SendBufferSize),
		userID:      userID,
		connectedAt: time.Now(),
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				metrics.WSUnexpectedDisconnectTotal.Inc()
				logger.Get().Warn().Err(err).Str("user_id", c.userID).Msg("unexpected disconnect")
			}
			break
		}
		logger.Get().Debug().Str("user_id", c.userID).Msg("received unexpected client message, discarding")
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}
			if err := w.Close(); err != nil {
				return
			}
			metrics.WSMessagesSentTotal.Add(float64(1 + n))
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
