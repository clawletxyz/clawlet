export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };

  const apiKey = localStorage.getItem("clawlet_api_key");
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(path, { ...opts, headers });

  if (res.status === 401) {
    throw new UnauthorizedError();
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? "Invalid server response" : `Request failed (${res.status})`);
  }
  if (!res.ok) {
    const err = data as Record<string, unknown>;
    throw new Error((err.error as string) || `Request failed (${res.status})`);
  }
  return data as T;
}
