import { loadConfig } from "../config.js";

interface PolyErrorBody {
  error?: string | { code?: string; message?: string };
  code?: string;
}

export class PolyApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PolyApiError";
  }
}

export async function polyGet<T>(path: string): Promise<T> {
  const config = loadConfig();
  const key = config.poly.apiKey.trim();
  if (!key) {
    throw new PolyApiError("未设置 Poly API Key。运行: arti config set poly.apiKey <your-key>");
  }

  const baseUrl = config.poly.apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const res = await fetch(`${baseUrl}/${normalizedPath}`, {
    headers: { "X-API-Key": key },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as PolyErrorBody;
    const detail = typeof body.error === "string" ? body.error : body.error?.message;
    const code = body.code ?? (typeof body.error === "object" ? body.error?.code : undefined);
    throw new PolyApiError(
      `Poly API ${res.status}: ${detail ?? res.statusText}`,
      res.status,
      code,
    );
  }

  return res.json() as Promise<T>;
}
