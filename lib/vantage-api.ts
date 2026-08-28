import { API_SECRET_HEADER } from "./auth";
import { getApiSecret } from "./request-context";

export const PRODUCTION_API_HOST = "vantage-movers-main-server.vercel.app";
export const PRODUCTION_API_BASE_URL = `https://${PRODUCTION_API_HOST}`;

export type VantageApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type VantageApiQuery = Record<
  string,
  string | number | boolean | undefined | null
>;

export type VantageApiRequest = {
  method?: VantageApiMethod;
  path: string;
  query?: VantageApiQuery;
  body?: unknown;
};

export type VantageApiResponse<T = unknown> = {
  ok: boolean;
  status: number;
  url: string;
  data: T;
};

export function getVantageApiBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.VANTAGE_API_BASE_URL?.trim() || PRODUCTION_API_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export function buildVantageApiUrl(
  baseUrl: string,
  path: string,
  query?: VantageApiQuery,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, `${baseUrl.replace(/\/+$/, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function buildVantageApiHeaders(apiSecret: string): Record<string, string> {
  return {
    accept: "application/json",
    [API_SECRET_HEADER]: apiSecret,
  };
}

export async function vantageApi<T = unknown>(
  request: VantageApiRequest,
  options: {
    baseUrl?: string;
    apiSecret?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<VantageApiResponse<T>> {
  const method = (request.method ?? "GET").toUpperCase() as VantageApiMethod;
  const baseUrl = options.baseUrl ?? getVantageApiBaseUrl();
  const apiSecret = options.apiSecret ?? getApiSecret();
  const fetchImpl = options.fetchImpl ?? fetch;

  const path = request.path.startsWith("/") ? request.path : `/${request.path}`;
  const url = buildVantageApiUrl(baseUrl, path, request.query);
  const headers = buildVantageApiHeaders(apiSecret);

  const init: RequestInit = { method, headers };
  if (request.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(request.body);
  }

  const response = await fetchImpl(url, init);
  const text = await response.text();
  let data: T;
  if (!text) {
    data = null as T;
  } else {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    url,
    data,
  };
}

export function formatVantageApiResult(response: VantageApiResponse) {
  return {
    ok: response.ok,
    status: response.status,
    data: response.data,
  };
}
