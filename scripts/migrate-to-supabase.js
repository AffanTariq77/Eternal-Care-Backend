// migrate-to-supabase.js
// Run with: node scripts/migrate-to-supabase.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in environment');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function main() {
  const file = path.join(process.cwd(), 'data.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);

  console.log(`Found ${data.users.length} users and ${data.bookings.length} bookings in data.json`);

  // create users
  for (const u of data.users) {
    try {
      // try to insert (use return=representation)
      const resp = await axios.post(`${SUPABASE_URL}/rest/v1/users`,
        { id: u.id, name: u.name, email: u.email, password_hash: u.password },
        { headers: { ...headers, Prefer: 'return=representation' }, validateStatus: () => true }
      );
      if (resp.status === 201 || (resp.status === 200 && resp.data && resp.data[0])) {
        console.log(`User inserted: ${u.email} (id ${u.id})`);
        continue;
      }
      if (resp.status === 409) {
        console.log(`User already exists (409): ${u.email}`);
        continue;
      }
      // fallback: try to fetch existing user by email
      const existing = await axios.get(`${SUPABASE_URL}/rest/v1/users`, { headers, params: { select: '*', email: `eq.${u.email}` }, validateStatus: () => true });
      if (existing.status === 200 && existing.data && existing.data.length) {
        console.log(`User exists by email: ${u.email}`);
        continue;
      }
      console.warn(`Failed to create user ${u.email}: status ${resp.status} ${resp.data && JSON.stringify(resp.data)}`);
    } catch (err) {
      console.error('Err creating user', u.email, err.message || err.toString());
    }
  }

  // create bookings (ensure user exists)
  for (const b of data.bookings) {
    try {
      // ensure user exists by id
      const uresp = await axios.get(`${SUPABASE_URL}/rest/v1/users`, { headers, params: { select: 'id,email', id: `eq.${b.userId}` }, validateStatus: () => true });
      let userId = b.userId;
      if (!(uresp.status === 200 && uresp.data && uresp.data.length)) {
        // try to find by email in file store
        const uByEmail = data.users.find((x) => x.id === b.userId) || null;
        if (uByEmail) {
          const resp2 = await axios.get(`${SUPABASE_URL}/rest/v1/users`, { headers, params: { select: 'id', email: `eq.${uByEmail.email}` }, validateStatus: () => true });
          if (resp2.status === 200 && resp2.data && resp2.data.length) {
            userId = resp2.data[0].id;
          } else {
            console.warn(`Booking ${b.id} refers to user ${b.userId} which doesn't exist in Supabase; skipping`);
            continue;
          }
        } else {
          console.warn(`Booking ${b.id} refers to unknown user ${b.userId}; skipping`);
          continue;
        }
      }

      const payload = { id: b.id, user_id: userId, package_id: b.packageId, date: b.date, status: b.status, meta: b.meta };
      const r = await axios.post(`${SUPABASE_URL}/rest/v1/bookings`, payload, { headers: { ...headers, Prefer: 'return=representation' }, validateStatus: () => true });
      if (r.status === 201 || (r.status === 200 && r.data && r.data[0])) {
        console.log(`Booking inserted: ${b.id}`);
        continue;
      }
      if (r.status === 409) {
        console.log(`Booking already exists: ${b.id}`);
        continue;
      }
      console.warn(`Failed to create booking ${b.id}: status ${r.status} ${r.data && JSON.stringify(r.data)}`);
    } catch (err) {
      console.error('Err creating booking', b.id, err.message || err.toString());
    }
  }

  console.log('Migration done — verify with REST queries');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
