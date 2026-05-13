import { loadConfig, saveConfig, type ArtiConfig } from "./config.js";

export interface AuthState {
  token: string;
  userId: string;
  email: string;
}

export function getAuthState(): AuthState {
  const config = loadConfig();
  return {
    token: config.auth.token,
    userId: config.auth.userId,
    email: config.auth.email,
  };
}

export function isLoggedIn(auth = getAuthState()): boolean {
  return Boolean(auth.token);
}

export function saveAuthState(auth: Partial<AuthState>): ArtiConfig {
  const config = loadConfig();
  config.auth = {
    token: auth.token ?? config.auth.token,
    userId: auth.userId ?? config.auth.userId,
    email: auth.email ?? config.auth.email,
  };
  saveConfig(config);
  return config;
}

export function clearAuthState(): ArtiConfig {
  const config = loadConfig();
  config.auth = {
    token: "",
    userId: "",
    email: "",
  };
  saveConfig(config);
  return config;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
