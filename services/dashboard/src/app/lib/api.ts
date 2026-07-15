export const API_URL = "http://localhost:8080/api/v1";
export const AUTH_URL = "http://localhost:8080/auth";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map(c => c.trim())
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.substring(name.length + 1)) : null;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = getCookie("aegis_token");

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = "API Request Failed";
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      errorMsg = (await response.text().catch(() => errorMsg)) || errorMsg;
    }
    throw new Error(errorMsg);
  }

  return response.json();
}
