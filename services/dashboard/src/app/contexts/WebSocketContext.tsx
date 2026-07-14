"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

export interface TransactionEvent {
  transaction_id: string;
  account_id: string;
  amount: number;
  merchant_id: string;
  timestamp: string;
  status: string;
  fraud_score: number;
  is_fraud: boolean;
}

interface WebSocketContextType {
  isConnected: boolean;
  latestEvent: TransactionEvent | null;
  events: TransactionEvent[];
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<TransactionEvent | null>(null);
  const [events, setEvents] = useState<TransactionEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connect = () => {
      // Connect to the Go WebSocket endpoint
      const wsUrl = `ws://localhost:8080/ws/feed?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        console.log("WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Assuming data is the transaction payload
          setLatestEvent(data);
          setEvents((prev) => [data, ...prev].slice(0, 50)); // Keep last 50
        } catch (err) {
          console.error("Error parsing WS message", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected. Reconnecting in 3s...");
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error", error);
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [token]);

  return (
    <WebSocketContext.Provider value={{ isConnected, latestEvent, events }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
