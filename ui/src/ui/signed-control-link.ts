import { normalizeBasePath } from "./navigation.ts";
import { normalizeOptionalString } from "./string-coerce.ts";

const SENSITIVE_QUERY_KEYS = ["token", "password", "gatewayUrl"] as const;

type SignedControlUiLinkParams = {
  href?: string | null;
  token?: string | null;
  publicUrl?: string | null;
  basePath?: string | null;
};

function currentHref(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location?.href ?? null;
}

function normalizePublicUrl(raw: string | null | undefined): URL | null {
  const value = normalizeOptionalString(raw);
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function pathWithoutBase(pathname: string, basePath: string): string {
  const normalizedBase = normalizeBasePath(basePath);
  if (!normalizedBase) {
    return pathname || "/";
  }
  if (pathname === normalizedBase) {
    return "/";
  }
  if (pathname.startsWith(`${normalizedBase}/`)) {
    return pathname.slice(normalizedBase.length) || "/";
  }
  return pathname || "/";
}

function joinPublicPath(publicPath: string, currentPath: string): string {
  const base = publicPath === "/" ? "" : publicPath.replace(/\/+$/u, "");
  const child = currentPath.startsWith("/") ? currentPath : `/${currentPath}`;
  return `${base}${child}` || "/";
}

function applyPublicUrl(target: URL, params: SignedControlUiLinkParams) {
  const publicUrl = normalizePublicUrl(params.publicUrl);
  if (!publicUrl) {
    return;
  }
  const currentPath = pathWithoutBase(target.pathname, params.basePath ?? "");
  target.protocol = publicUrl.protocol;
  target.hostname = publicUrl.hostname;
  target.port = publicUrl.port;
  target.pathname = joinPublicPath(publicUrl.pathname || "/", currentPath);
}

export function buildSignedControlUiLink(params: SignedControlUiLinkParams = {}): string | null {
  const token = normalizeOptionalString(params.token);
  if (!token) {
    return null;
  }

  const href = normalizeOptionalString(params.href) ?? currentHref();
  if (!href) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  applyPublicUrl(url, params);

  for (const key of SENSITIVE_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  for (const key of SENSITIVE_QUERY_KEYS) {
    hashParams.delete(key);
  }
  hashParams.set("token", token);
  url.hash = hashParams.toString();

  return url.toString();
}
