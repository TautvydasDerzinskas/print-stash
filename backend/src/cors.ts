/** Port of MakersVault main.py's normalize_origin/resolve_cors_origins (lines ~112-149). */
function normalizeOrigin(raw: string | undefined): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.host) return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const candidates: string[] = [];
  for (const name of ["PUBLIC_URL", "VITE_API_URL"]) {
    const origin = normalizeOrigin(process.env[name]);
    if (origin && !candidates.includes(origin)) candidates.push(origin);
  }
  if (candidates.length) return candidates;
  return ["http://localhost:5173"];
}
