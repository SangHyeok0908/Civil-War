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
  const [stored, setStored] = useState<{
    url: string;
    data?: T;
    error?: ApiFailure;
    loading: boolean;
  }>({ url, loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A different address starts empty; the same address keeps what is on screen while it reloads.
  const state: typeof stored =
    stored.url === url ? stored : { url, loading: true };
  useEffect(() => {
    let active = true;
    setStored((previous) =>
      previous.url === url ? previous : { url, loading: true },
    );
    setRefreshing(true);
    api<T>(url)
      .then((data) => {
        if (active) setStored({ url, data, loading: false });
      })
      .catch((error) => {
        if (active) setStored({ url, error, loading: false });
      })
      .finally(() => {
        if (active) setRefreshing(false);
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
  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    refreshing,
    reload: () => setAttempt((n) => n + 1),
  };
}
