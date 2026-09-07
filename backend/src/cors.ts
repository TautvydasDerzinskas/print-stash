export function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // The frontend's own nginx proxies /api/* to this backend server-side, so browser calls
  // through it are same-origin and never hit CORS. This default only matters for local dev,
  // where the Vite dev server (port 5173) calls the backend directly.
  return ["http://localhost:5173"];
}
