// Reads the seeded credentials from server/.env.test (the same file the API
// and the seed script use), so tests never hardcode passwords.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvFile(): Record<string, string> {
  const file = resolve(import.meta.dirname, "../../server/.env.test");
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !m[1]) continue;
    env[m[1]] = (m[2] ?? "").replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const env = readEnvFile();

function need(key: string): string {
  const v = env[key];
  if (!v) throw new Error(`${key} is missing from server/.env.test`);
  return v;
}

export const admin = {
  email: need("SEED_ADMIN_EMAIL"),
  password: need("SEED_ADMIN_PASSWORD"),
  name: "Admin",
};
export const agent = {
  email: need("SEED_AGENT_EMAIL"),
  password: need("SEED_AGENT_PASSWORD"),
  name: "Agent",
};

export const CLIENT_ORIGIN = "http://localhost:5174";
export const AUTH_DIR = resolve(import.meta.dirname, "../playwright/.auth");
export const ADMIN_STATE = resolve(AUTH_DIR, "admin.json");
export const AGENT_STATE = resolve(AUTH_DIR, "agent.json");
export const INBOUND_EMAIL_SECRET = need("INBOUND_EMAIL_SECRET");
export const API_URL = "http://localhost:3001";
