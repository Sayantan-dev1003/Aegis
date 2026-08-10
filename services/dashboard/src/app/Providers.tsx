"use client";

import React from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { NotificationProvider } from "./contexts/NotificationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
