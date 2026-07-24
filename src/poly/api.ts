import { ensureValidAccessToken } from "../auth.js";
import { callEdge, ApiError } from "../api.js";

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
  if (!token) {
    throw new PolyApiError("未登录。交互终端输入 /login，外层运行 arti login");
  }

  try {
    const res = await callEdge<PolyDataResponse<T>>("poly-data", { path });
    return res.data;
  } catch (err) {
    // L17：保留原始 HTTP status，便于上层区分 404/429/5xx
    if (err instanceof ApiError) {
      throw new PolyApiError(err.message, err.status);
    }
    if (err instanceof Error) {
      throw new PolyApiError(err.message);
    }
    throw err;
  }
}
