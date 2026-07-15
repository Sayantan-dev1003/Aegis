"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

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

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Clear any stale localStorage data from previous versions
    localStorage.removeItem("aegis_token");
    localStorage.removeItem("aegis_user");

    // Read auth state from cookies
    const storedToken = getCookie("aegis_token");
    const storedUser = getCookie("aegis_user");

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && typeof parsedUser === "object") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setToken(storedToken);
          setUser(parsedUser);
        } else {
          deleteCookie("aegis_token");
          deleteCookie("aegis_user");
        }
      } catch {
        // Malformed cookie — clear and force re-login
        deleteCookie("aegis_token");
        deleteCookie("aegis_user");
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!token && pathname !== "/login") {
        router.push("/login");
      }
    }
  }, [token, isLoading, pathname, router]);

  const login = (newToken: string, newUser: User) => {
    // Store token for 15 minutes (matching JWT_ACCESS_TTL)
    setCookie("aegis_token", newToken, 15 * 60);
    // Store user info for 7 days (matching JWT_REFRESH_TTL)
    setCookie("aegis_user", JSON.stringify(newUser), 7 * 24 * 60 * 60);
    setToken(newToken);
    setUser(newUser);
    
    // Redirect based on role
    const defaultRoute = newUser.role === "admin" 
      ? "/admin/health" 
      : newUser.role === "viewer" 
        ? "/viewer/overview" 
        : "/reviewer/queue";
        
    router.push(defaultRoute);
  };

  const logout = () => {
    deleteCookie("aegis_token");
    deleteCookie("aegis_user");
    setToken(null);
    setUser(null);
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
