import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    // Forward server-side JWT TTL vars to the browser (read from root .env)
    JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? "30m",
    JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? "8h",
    // How early to refresh before access token expiry (default 2 minutes)
    JWT_REFRESH_BUFFER: process.env.JWT_REFRESH_BUFFER ?? "2m",
  },
};

export default nextConfig;
