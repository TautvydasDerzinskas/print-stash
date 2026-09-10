import { PrismaClient } from "@prisma/client";
import { setActiveClient } from "../db";

export type PostgresCredentials = {
  database: string;
  user: string;
  password: string;
};

export type DatabaseInfo = {
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
};

type ParsedUrl = { host: string; port: string; database: string; user: string; password: string };

function parseDatabaseUrl(raw: string): ParsedUrl | null {
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: url.port,
      database: url.pathname.replace(/^\//, ""),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return null;
  }
}

// Host/port are frozen at process start -- never admin-editable. "Test & Save" below can only
// repoint at a different database/user/password on the SAME Postgres server this process was
// started against; reaching a different host/port means changing DATABASE_URL and restarting,
// same as any other env-derived setting in this app.
const original = parseDatabaseUrl(process.env.DATABASE_URL || "");

// In-memory only, not persisted -- a successful "Test & Save" swap affects this running process
// for as long as it keeps running, but does NOT survive a restart/redeploy. A restart always
// boots from DATABASE_URL as configured in the environment, exactly as it did before this
// feature existed. Persisting the override so it also survived a restart would need to write it
// into whatever database ends up live, but a fresh boot reads DATABASE_URL before it can know to
// look anywhere else -- a chicken-and-egg the process can't resolve on its own. If a switch made
// here should stick, update DATABASE_URL itself.
let active: PostgresCredentials | null = original
  ? { database: original.database, user: original.user, password: original.password }
  : null;

export function getDatabaseInfo(): DatabaseInfo {
  return {
    host: original?.host ?? null,
    port: original?.port ? Number(original.port) : null,
    database: active?.database ?? null,
    user: active?.user ?? null,
  };
}

function buildCandidateUrl(creds: PostgresCredentials): string | null {
  if (!original) return null;
  const auth = `${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}`;
  return `postgresql://${auth}@${original.host}:${original.port}/${creds.database}?schema=public`;
}

function friendlyConnectionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/password authentication failed/i.test(message)) return "Authentication failed for that user/password.";
  if (/database .* does not exist/i.test(message)) return "That database does not exist.";
  if (/relation .?"?User"?.? does not exist/i.test(message)) {
    return "Connected, but that database has no Thingport tables yet -- run migrations against it first.";
  }
  return `Could not connect: ${message}`;
}

/** Tests a candidate database/user/password against the live Postgres server (same host/port
 * this process was started with) before touching anything -- only on success does it hot-swap
 * every `prisma.*` call in the running process over to it. Mirrors youtube-mp3-vault's
 * "Test & Save" Postgres tab; see the module comment above for why the switch is in-memory only,
 * not persisted across a restart. */
export async function testAndSwitchDatabase(creds: PostgresCredentials): Promise<DatabaseInfo> {
  const url = buildCandidateUrl(creds);
  if (!url) throw new Error("DATABASE_URL is not set for this instance -- nothing to switch relative to.");

  const candidate = new PrismaClient({ datasources: { db: { url } } });
  try {
    await candidate.$connect();
    await candidate.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 1');
  } catch (err) {
    await candidate.$disconnect().catch(() => undefined);
    throw new Error(friendlyConnectionError(err), { cause: err });
  }

  setActiveClient(candidate);
  active = creds;
  return getDatabaseInfo();
}
