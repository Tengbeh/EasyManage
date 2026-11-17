import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryString, setDisplayPreferences, type Row } from "./utils";
export type Envelope<T> = {
  data: T;
  meta?: { total: number; page: number; pageSize: number };
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}
export async function request<T = Row>(
  path: string,
  options: RequestInit & { key?: string } = {},
): Promise<Envelope<T>> {
  const { key, ...init } = options;
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.method && init.method !== "GET"
        ? {
            "x-csrf-token": csrfToken,
            "Idempotency-Key": key || crypto.randomUUID(),
          }
        : {}),
      ...init.headers,
    },
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Please try again.",
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/me")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      result.error?.message || `Request failed (${response.status}).`,
      response.status,
      result.error?.code,
      result.error?.details,
    );
  }
  return result;
}
export function useList(resource: string, filters: Row = {}, enabled = true) {
  const suffix = queryString(filters);
  return useQuery({
    queryKey: [resource, filters],
    queryFn: ({ signal }) =>
      request<Row[]>(`/${resource}${suffix ? "?" + suffix : ""}`, { signal }),
    enabled,
  });
}
export function useRecord<T = Row>(resource: string, enabled = true) {
  return useQuery({
    queryKey: [resource],
    queryFn: async ({ signal }) => {
      const result = await request<T>(`/${resource}`, { signal });
      if (resource === "settings") setDisplayPreferences(result.data as Row);
      return result;
    },
    enabled,
  });
}
export type Operation = {
  path: string;
  method?: string;
  body?: Row;
  key?: string;
};
export function useAction(success = "Changes saved") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = "POST", body = {}, key }: Operation) =>
      request(path, { method, body: JSON.stringify(body), key }),
    retry: false,
    onSuccess: () => {
      qc.invalidateQueries();
      if (success) toast.success(success);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export async function downloadReport(
  type: string,
  filters: Row,
  format: string,
) {
  const response = await fetch(
    `/api/reports/${type}?${queryString({ ...filters, format })}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || "Could not export this report.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `easymanage-${type}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFile(path: string, filename: string) {
  const response = await fetch(`/api${path}`, { credentials: "include" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ApiError(
      result.error?.message || "Could not download this file.",
      response.status,
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const disposition = response.headers.get("Content-Disposition") || "";
  const supplied = /filename="([^"\r\n]+)"/i.exec(disposition)?.[1];
  const extension = (
    {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
    } as Record<string, string>
  )[blob.type];
  anchor.download =
    supplied?.replace(/[\\/]/g, "_") ||
    (extension && !/\.[a-z0-9]+$/i.test(filename)
      ? `${filename}.${extension}`
      : filename);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
