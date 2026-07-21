"use client";

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { AUTH_URL } from "../lib/api";

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#E8EDF4',
  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem', fontWeight: 600, color: '#8D9AAB',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
  display: 'block'
};

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${AUTH_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let errMsg = "Login failed";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = await res.text().catch(() => errMsg);
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      login(data.access_token, data.analyst);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#04060A',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(92,110,248,0.07) 0%, transparent 60%)',
        pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%', maxWidth: '420px', padding: '40px',
        background: 'linear-gradient(145deg, rgba(15,17,23,0.9) 0%, rgba(13,17,23,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(92,110,248,0.1)',
        backdropFilter: 'blur(10px)', zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2rem', fontWeight: 700, color: '#E8EDF4', letterSpacing: '-0.02em' }}>
            Aegis
          </h1>
          <div style={{ fontSize: '0.85rem', color: '#5C6EF8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Fraud Defense System
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: '10px', color: '#FCA5A5', fontSize: '0.85rem', marginBottom: '24px', textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              style={inputStyle}
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              style={inputStyle}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '10px', padding: '14px', borderRadius: '10px', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
              color: '#fff', fontWeight: 600, fontSize: '0.95rem',
              boxShadow: '0 8px 24px rgba(92,110,248,0.35)', opacity: isLoading ? 0.7 : 1,
              transition: 'transform 0.1s, box-shadow 0.2s',
            }}
          >
            {isLoading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
