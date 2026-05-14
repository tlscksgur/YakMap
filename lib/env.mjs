import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(cwd = process.cwd()) {
  const env = { ...process.env };
  const envPath = resolve(cwd, ".env");
  if (!existsSync(envPath)) return env;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || env[key] !== undefined) continue;
    env[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return env;
}
