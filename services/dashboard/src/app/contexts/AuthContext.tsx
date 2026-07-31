"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { parseDurationMs } from "../lib/parseDuration";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, refreshToken: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

// ─── Constants (driven from .env via next.config.ts) ─────────────────────────

// JWT_ACCESS_TTL and JWT_REFRESH_TTL are forwarded from root .env → next.config.ts → process.env
const ACCESS_TTL_MS = parseDurationMs(process.env.JWT_ACCESS_TTL ?? "30m");
const REFRESH_TTL_MS = parseDurationMs(process.env.JWT_REFRESH_TTL ?? "8h");
// Refresh the access token this long before it expires (driven from JWT_REFRESH_BUFFER)
const REFRESH_BUFFER_MS = parseDurationMs(process.env.JWT_REFRESH_BUFFER ?? "2m");

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Strict`;
}

function getCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Ref to hold the silent-refresh timer so we can cancel it on logout
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const clearSession = () => {
    deleteCookie("aegis_token");
    deleteCookie("aegis_refresh_token");
    deleteCookie("aegis_user");
    setToken(null);
    setUser(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  /**
   * Schedules a silent token refresh (ACCESS_TTL - REFRESH_BUFFER) ms from now.
   * When it fires it calls POST /auth/refresh. On failure it clears the session.
   */
  const scheduleRefresh = (refreshToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const delay = ACCESS_TTL_MS - REFRESH_BUFFER_MS; // fire 2 min before expiry
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("http://localhost:8080/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
          // Refresh token expired or blacklisted — force logout
          clearSession();
          router.push("/login");
          return;
        }

        const data = await res.json();
        const newAccessToken: string = data.access_token;

        // Persist new access token (30-minute cookie)
        setCookie("aegis_token", newAccessToken, ACCESS_TTL_MS / 1000);
        setToken(newAccessToken);

        // Schedule the next refresh cycle using the same refresh token
        scheduleRefresh(refreshToken);
      } catch {
        // Network failure — clear and redirect
        clearSession();
        router.push("/login");
      }
    }, delay);
  };

  // ─── Bootstrap: Read cookies on mount ─────────────────────────────────────

  useEffect(() => {
    // Clear any stale localStorage data from previous versions
    localStorage.removeItem("aegis_token");
    localStorage.removeItem("aegis_user");

    const storedToken = getCookie("aegis_token");
    const storedRefresh = getCookie("aegis_refresh_token");
    const storedUser = getCookie("aegis_user");

    if (storedToken && storedRefresh && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && typeof parsedUser === "object") {
          setToken(storedToken);
          setUser(parsedUser);
          // Resume the silent refresh cycle with the stored refresh token
          scheduleRefresh(storedRefresh);
        } else {
          clearSession();
        }
      } catch {
        clearSession();
      }
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Redirect unauthenticated users ───────────────────────────────────────

  useEffect(() => {
    if (!isLoading && !token && pathname !== "/login") {
      router.push("/login");
    }
  }, [token, isLoading, pathname, router]);

  // ─── Cleanup timer on unmount ──────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // ─── Public API ───────────────────────────────────────────────────────────

  const login = (newToken: string, newRefreshToken: string, newUser: User) => {
    // Access token cookie — 30 minutes
    setCookie("aegis_token", newToken, ACCESS_TTL_MS / 1000);
    // Refresh token cookie — 8 hours
    setCookie("aegis_refresh_token", newRefreshToken, REFRESH_TTL_MS / 1000);
    // User cookie — 8 hours (matches refresh token lifetime)
    setCookie("aegis_user", JSON.stringify(newUser), REFRESH_TTL_MS / 1000);

    setToken(newToken);
    setUser(newUser);

    // Kick off the silent refresh cycle
    scheduleRefresh(newRefreshToken);

    // Redirect based on role
    const defaultRoute =
      newUser.role === "admin"
        ? "/admin/health"
        : newUser.role === "viewer"
        ? "/viewer/overview"
        : "/reviewer/queue";

    router.push(defaultRoute);
  };

  const logout = async () => {
    const refreshToken = getCookie("aegis_refresh_token");

    // Tell the server to blacklist the refresh token in Redis
    if (refreshToken) {
      try {
        await fetch("http://localhost:8080/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore network failures — still clear locally
      }
    }

    clearSession();
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
