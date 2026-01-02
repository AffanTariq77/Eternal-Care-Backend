import axios from 'axios';

function headers() {
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE);
}

export async function getUserByEmail(email: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.get(url, { headers: headers(), params: { select: '*', email: `eq.${email}` } });
  return resp.data && resp.data[0];
}

export async function createUser(user: { id: string; name: string; email: string; password_hash: string }) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.post(url, user, { headers: { ...headers(), Prefer: 'return=representation' }, validateStatus: () => true });
  if (resp.data && resp.data[0]) return resp.data[0];
  // fallback: retry fetching by email a few times (PostgREST sometimes returns empty body then the row is visible)
  for (let i = 0; i < 5; i++) {
    const u = await getUserByEmail(user.email);
    if (u) return u;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export async function createBooking(booking: any) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/bookings`;
  const resp = await axios.post(url, booking, { headers: { ...headers(), Prefer: 'return=representation' }, validateStatus: () => true });
  if (resp.data && resp.data[0]) return resp.data[0];
  // fallback: retry fetching by id a few times
  if (booking.id) {
    for (let i = 0; i < 5; i++) {
      const row = await getBookingById(booking.id);
      if (row) return row;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

export async function getBookings(userId?: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/bookings`;
  const params: any = { select: '*' };
  if (userId) params['user_id'] = `eq.${userId}`;
  const resp = await axios.get(url, { headers: headers(), params });
  return resp.data;
}

export async function getBookingById(id: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/bookings`;
  const resp = await axios.get(url, { headers: headers(), params: { select: '*', id: `eq.${id}` } });
  return resp.data && resp.data[0];
}

export async function getProfile(userId: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.get(url, { headers: headers(), params: { select: '*', id: `eq.${userId}` } });
  return resp.data && resp.data[0];
}

export async function updateProfile(userId: string, patch: any) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.patch(url, patch, { headers: { ...headers(), Prefer: 'return=representation' }, params: { id: `eq.${userId}` } });
  return resp.data && resp.data[0];
}
export async function getUserTokens(userId: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.get(url, { headers: headers(), params: { select: 'id,expo_tokens', id: `eq.${userId}` } });
  const row = resp.data && resp.data[0];
  return (row && row.expo_tokens) || [];
}

// Create a payment record in Supabase
export async function createPayment(payment: any) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/payments`;
  const resp = await axios.post(url, payment, { headers: { ...headers(), Prefer: 'return=representation' }, validateStatus: () => true });
  if (resp.data && resp.data[0]) return resp.data[0];
  return null;
}

export async function updateBooking(id: string, patch: any) {
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/bookings`;
  const resp = await axios.patch(url, patch, { headers: { ...headers(), Prefer: 'return=representation' }, params: { id: `eq.${id}` } });
  return resp.data && resp.data[0];
}

export async function addPushToken(userId: string, token: string) {
  const tokens = await getUserTokens(userId);
  if (tokens.includes(token)) return { added: false, tokens };
  const newTokens = [...tokens, token];
  const SUPABASE_URL = process.env.SUPABASE_URL as string;
  const url = `${SUPABASE_URL}/rest/v1/users`;
  const resp = await axios.patch(url, { expo_tokens: newTokens }, { headers: { ...headers(), Prefer: 'return=representation' }, params: { id: `eq.${userId}` } });
  return { added: true, tokens: resp.data && resp.data[0] && resp.data[0].expo_tokens ? resp.data[0].expo_tokens : newTokens };
}