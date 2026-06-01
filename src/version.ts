/**
 * 统一版本源 — 从 package.json 读取，避免多处写死导致漂移。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  try {
    // 开发态: src/ → ../package.json；构建态: dist/ → ../package.json
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readVersion();
