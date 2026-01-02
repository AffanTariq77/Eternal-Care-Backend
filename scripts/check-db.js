#!/usr/bin/env node
require('dotenv').config();
const postgres = require('postgres');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(2);
}
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, timeout: 5000 });
(async () => {
  try {
    const r = await sql`SELECT 1 as ok`;
    console.log('DB OK', r);
    process.exit(0);
  } catch (err) {
    console.error('DB connection failed', err.message || err);
    process.exit(1);
  } finally {
    try { await sql.end(); } catch (e) {}
  }
})();