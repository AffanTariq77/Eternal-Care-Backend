import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

// Node.js 20 lacks native WebSocket — polyfill before Supabase Realtime initialises
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

let _client: SupabaseClient | null = null;

// Read lazily so dotenv.config() in index.ts has time to run first
function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function getKey() {
  // Prefer service role key (bypasses RLS); fall back to publishable/anon key
  return process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
}

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(getUrl(), getKey(), {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export function isSupabaseConfigured() {
  return Boolean(getUrl() && getKey());
}

export async function getUserByEmail(email: string) {
  const { data } = await getClient().from('users').select('*').eq('email', email).single();
  return data;
}

export async function createUser(user: { id: string; name: string; email: string; password_hash: string }) {
  const { data } = await getClient().from('users').insert(user).select().single();
  if (data) return data;
  // Retry fetch — PostgREST may return empty on first insert
  for (let i = 0; i < 5; i++) {
    const u = await getUserByEmail(user.email);
    if (u) return u;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export async function createBooking(booking: any) {
  const { data } = await getClient().from('bookings').insert(booking).select().single();
  if (data) return data;
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
  let query = getClient().from('bookings').select('*');
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return data ?? [];
}

export async function getBookingById(id: string) {
  const { data } = await getClient().from('bookings').select('*').eq('id', id).single();
  return data;
}

export async function getProfile(userId: string) {
  const { data } = await getClient().from('users').select('*').eq('id', userId).single();
  return data;
}

export async function updateProfile(userId: string, patch: any) {
  const { data } = await getClient().from('users').update(patch).eq('id', userId).select().single();
  return data;
}

export async function getUserTokens(userId: string) {
  const { data } = await getClient().from('users').select('id, expo_tokens').eq('id', userId).single();
  return (data && data.expo_tokens) || [];
}

export async function createPayment(payment: any) {
  const { data } = await getClient().from('payments').insert(payment).select().single();
  return data;
}

export async function updateBooking(id: string, patch: any) {
  const { data } = await getClient().from('bookings').update(patch).eq('id', id).select().single();
  return data;
}

export async function addPushToken(userId: string, token: string) {
  const tokens = await getUserTokens(userId);
  if (tokens.includes(token)) return { added: false, tokens };
  const newTokens = [...tokens, token];
  const { data } = await getClient().from('users').update({ expo_tokens: newTokens }).eq('id', userId).select().single();
  return { added: true, tokens: (data && data.expo_tokens) || newTokens };
}
