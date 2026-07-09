import { ensureValidAccessToken } from "../auth.js";
import { callEdge } from "../api.js";

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

interface PolyDataResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export async function polyGet<T>(path: string): Promise<T> {
  const token = await ensureValidAccessToken();
  if (!token) throw new PolyApiError("未登录。运行: arti login");

  try {
    const res = await callEdge<PolyDataResponse<T>>("poly-data", { path });
    return res.data;
  } catch (err) {
    if (err instanceof Error) {
      throw new PolyApiError(err.message);
    }
    throw err;
  }
}
