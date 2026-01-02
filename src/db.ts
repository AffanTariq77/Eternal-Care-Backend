import postgres from 'postgres';

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbConnected = false;
let lastError: any = null;

export function isDBConnected() {
  return dbConnected;
}

export function getLastDBError() {
  return lastError ? (lastError.message || String(lastError)) : null;
}

function createClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  return postgres(process.env.DATABASE_URL, {
    ssl: { rejectUnauthorized: false },
    // small timeout to fail fast when network is unreachable
    timeout: 5000,
  });
}

async function connectWithRetry(retries = 3, delayMs = 2000) {
  if (!process.env.DATABASE_URL) return false;
  let lastErr: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      sqlClient = createClient();
      // lightweight check
      await sqlClient`SELECT 1`;
      dbConnected = true;
      return true;
    } catch (err) {
      lastErr = err;
      lastError = err;
      try {
        (sqlClient as any)?.end?.();
      } catch (e) {}
      sqlClient = null;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.warn('DB connection failed after retries', lastErr?.message || lastErr);
  lastError = lastErr;
  return false;
}

export async function initDB() {
  const ok = await connectWithRetry(3, 2000);
  if (!ok) return false;
  const sql = sqlClient as ReturnType<typeof postgres>;

  await sql`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    name text,
    email text UNIQUE NOT NULL,
    password text NOT NULL,
    created_at timestamptz DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS bookings (
    id text PRIMARY KEY,
    user_id text REFERENCES users(id) ON DELETE CASCADE,
    package_id text,
    date timestamptz,
    status text,
    meta jsonb,
    created_at timestamptz DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS payments (
    id text PRIMARY KEY,
    booking_id text REFERENCES bookings(id) ON DELETE CASCADE,
    amount numeric,
    status text,
    created_at timestamptz DEFAULT now()
  )`;

  return true;
}

export function getSql() {
  if (!sqlClient) throw new Error('DB not connected');
  return sqlClient;
}

export default { getSql, isDBConnected };
