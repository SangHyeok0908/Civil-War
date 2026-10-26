import { useEffect, useState } from "react";
export class ApiFailure extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" && csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiFailure("NETWORK_ERROR", 0);
  }
  if (response.status === 204) return undefined as T;
  const value = await response.json().catch(() => {
    throw new ApiFailure("INVALID_RESPONSE", response.status);
  });
  if (!response.ok || response.status === 202)
    throw new ApiFailure(value.code || "SERVER_ERROR", response.status);
  return value as T;
}
export function useRemote<T>(url: string, isPending?: (data: T) => boolean) {
  const [state, setState] = useState<{
    data?: T;
    error?: ApiFailure;
    loading: boolean;
  }>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    api<T>(url)
      .then((data) => {
        if (active) setState({ data, loading: false });
      })
      .catch((error) => {
        if (active) setState({ error, loading: false });
      });
    return () => {
      active = false;
    };
  }, [url, attempt]);
  useEffect(() => {
    if (
      state.error?.code !== "RECALCULATING" &&
      !(state.data && isPending?.(state.data))
    )
      return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), 2000);
    return () => clearTimeout(timer);
  }, [state.error, state.data, isPending]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
