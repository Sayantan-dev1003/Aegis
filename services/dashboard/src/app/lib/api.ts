import { parseDurationMs } from "./parseDuration";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const API_URL = `${BASE_URL}/api/v1`;
export const AUTH_URL = `${BASE_URL}/auth`;

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map(c => c.trim())
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.substring(name.length + 1)) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Strict`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

// ─── Prevent concurrent refresh attempts ─────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string | null) => void) {
  refreshSubscribers.push(callback);
}

function notifySubscribers(token: string | null) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

// ─── Silent refresh ───────────────────────────────────────────────────────────

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = getCookie("aegis_refresh_token");
  if (!refreshToken) return null;

  const res = await fetch(`${AUTH_URL}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    // Refresh token expired — wipe session so AuthContext redirects to login
    deleteCookie("aegis_token");
    deleteCookie("aegis_refresh_token");
    deleteCookie("aegis_user");
    return null;
  }

  const data = await res.json();
  const newToken: string = data.access_token;

  // 30-minute cookie (driven from JWT_ACCESS_TTL env var via next.config.ts)
  const accessTtlSeconds = Math.floor(parseDurationMs(process.env.JWT_ACCESS_TTL ?? "30m") / 1000);
  setCookie("aegis_token", newToken, accessTtlSeconds);
  return newToken;
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

export async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getCookie("aegis_token");

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`;
  const response = await fetch(url, { ...options, headers });

  // ── 401: Try a silent token refresh and retry the original request once ──
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const newToken = await attemptTokenRefresh();
        notifySubscribers(newToken);
        isRefreshing = false;

        if (!newToken) {
          // Refresh failed — AuthContext will redirect to /login on next render
          throw new Error("Session expired. Please log in again.");
        }

        // Retry original request with new token
        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set("Content-Type", "application/json");
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        const retryResponse = await fetch(url, { ...options, headers: retryHeaders });

        if (!retryResponse.ok) {
          const text = await retryResponse.text().catch(() => "");
          let errMsg = "API Request Failed";
          try { errMsg = JSON.parse(text).error || errMsg; } catch { errMsg = text || errMsg; }
          throw new Error(errMsg);
        }
        return retryResponse.json();

      } catch (err) {
        isRefreshing = false;
        notifySubscribers(null);
        throw err;
      }
    } else {
      // Another refresh is already in progress — wait for it
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          if (!newToken) {
            reject(new Error("Session expired. Please log in again."));
            return;
          }
          try {
            const retryHeaders = new Headers(options.headers || {});
            retryHeaders.set("Content-Type", "application/json");
            retryHeaders.set("Authorization", `Bearer ${newToken}`);
            const retryResponse = await fetch(url, { ...options, headers: retryHeaders });
            if (!retryResponse.ok) {
              const text = await retryResponse.text().catch(() => "");
              let errMsg = "API Request Failed";
              try { errMsg = JSON.parse(text).error || errMsg; } catch { errMsg = text || errMsg; }
              reject(new Error(errMsg));
            } else {
              resolve(retryResponse.json());
            }
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  }

  // ── Other non-2xx errors ──────────────────────────────────────────────────
  if (!response.ok) {
    let errorMsg = "API Request Failed";
    try {
      const text = await response.text();
      try {
        const errorData = JSON.parse(text);
        errorMsg = errorData.error || errorMsg;
      } catch {
        errorMsg = text || errorMsg;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json();
}
