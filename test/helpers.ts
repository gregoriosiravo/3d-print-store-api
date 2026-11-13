import "dotenv/config";
import { Pool } from "pg";
import { promises as fs } from "fs";
import path from "path";

export const API = process.env.API_URL ?? "http://localhost:4000/api";

// Every row the tests create is tagged with this stamp, and cleanup deletes by it
export const STAMP = `${Date.now()}`;
export const SESSION_ID = `probe-${STAMP}`;
export const probeEmail = (tag: string) => `probe-${STAMP}-${tag}@example.com`;

// Same connection settings as the API (src/config/database.ts)
export const db = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

type CallOptions = {
  token?: string;
  cookie?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
};

export async function call(method: string, route: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${API}${route}`, { method, headers, body });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

// A 40 mm cube in ASCII STL (the parser reads millimetres)
export function cubeStl(): Buffer {
  const s = 40;
  const v = (x: number, y: number, z: number) => `vertex ${x * s} ${y * s} ${z * s}`;
  const faces = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [1, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 0, 1], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [0, 1, 0], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [1, 0, 1], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 1, 0]],
  ];
  const lines = ["solid probe"];
  for (const [a, b, c] of faces) {
    lines.push(" facet normal 0 0 0", "  outer loop",
      `   ${v(a[0], a[1], a[2])}`, `   ${v(b[0], b[1], b[2])}`, `   ${v(c[0], c[1], c[2])}`,
      "  endloop", " endfacet");
  }
  lines.push("endsolid probe");
  return Buffer.from(lines.join("\n"));
}

// Uploads a cube as a guest (or with a token) tagged with this run's session id
export async function uploadCube(options: { token?: string; layerHeight?: string; infillDensity?: string } = {}) {
  const form = new FormData();
  form.append("stl", new Blob([cubeStl()]), "probe.stl");
  form.append("materialId", "1");
  form.append("layerHeight", options.layerHeight ?? "0.2");
  form.append("infillDensity", options.infillDensity ?? "25");
  return call("POST", "/quote", {
    form,
    token: options.token,
    headers: { "x-session-id": SESSION_ID },
  });
}

export async function register(tag: string) {
  const email = probeEmail(tag);
  const res = await call("POST", "/auth/register", {
    body: { email, password: "probe-password", firstName: "Probe", lastName: tag },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [email]);
  return { token: res.body.token as string, id: rows[0].id as string, email };
}

// Removes every row this run created, dependents first. Returns the counts it deleted.
export async function cleanupProbeRows() {
  const quotes = await db.query("SELECT id, s3_key FROM quotes WHERE session_id = $1", [SESSION_ID]);
  const quoteIds = quotes.rows.map((r) => r.id);
  const users = await db.query("SELECT id FROM users WHERE email LIKE $1", [`probe-${STAMP}-%`]);

  const deleted = { orders: 0, quotes: 0, users: 0, files: 0 };
  if (quoteIds.length) {
    const orders = await db.query("DELETE FROM orders WHERE quote_id = ANY($1::uuid[])", [quoteIds]);
    deleted.orders = orders.rowCount ?? 0;
    const removed = await db.query("DELETE FROM quotes WHERE id = ANY($1::uuid[])", [quoteIds]);
    deleted.quotes = removed.rowCount ?? 0;
    for (const row of quotes.rows) {
      if (row.s3_key) {
        await fs.unlink(row.s3_key).then(() => deleted.files++, () => undefined);
      }
    }
  }
  const removedUsers = await db.query("DELETE FROM users WHERE email LIKE $1", [`probe-${STAMP}-%`]);
  deleted.users = removedUsers.rowCount ?? 0;
  if (users.rowCount !== deleted.users) {
    throw new Error(`cleanup mismatch: found ${users.rowCount} users, deleted ${deleted.users}`);
  }
  return deleted;
}

export const uploadPath = (filepath: string) => path.join(process.cwd(), filepath);
