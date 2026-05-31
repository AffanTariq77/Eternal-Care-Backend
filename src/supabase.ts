import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import ws from 'ws';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

let _client: SupabaseClient | null = null;

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function getKey() {
  return process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
}

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(getUrl(), getKey(), { auth: { persistSession: false } });
  }
  return _client;
}

export function isSupabaseConfigured() {
  return Boolean(getUrl() && getKey());
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const { data } = await getClient().from('users').select('*').eq('email', email).single();
  return data;
}

export async function createUser(user: { id: string; name: string; email: string; password_hash: string }) {
  const { data, error } = await getClient().from('users').insert(user).select().single();
  if (error) throw new Error(error.message);
  if (data) return data;
  for (let i = 0; i < 5; i++) {
    const u = await getUserByEmail(user.email);
    if (u) return u;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
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

export async function addPushToken(userId: string, token: string) {
  const tokens = await getUserTokens(userId);
  if (tokens.includes(token)) return { added: false, tokens };
  const newTokens = [...tokens, token];
  const { data } = await getClient().from('users').update({ expo_tokens: newTokens }).eq('id', userId).select().single();
  return { added: true, tokens: (data && data.expo_tokens) || newTokens };
}

export async function listUsers() {
  const { data } = await getClient().from('users').select('id, name, email, role, created_at').order('created_at', { ascending: false });
  return data ?? [];
}

// ─── Graveyards ───────────────────────────────────────────────────────────────

export async function listGraveyards() {
  const { data } = await getClient().from('graveyards').select('*').order('created_at', { ascending: false });
  return data ?? [];
}

export async function getGraveyardById(id: string) {
  const { data } = await getClient().from('graveyards').select('*').eq('id', id).single();
  return data;
}

export async function createGraveyard(g: any) {
  const { data, error } = await getClient().from('graveyards').insert(g).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateGraveyard(id: string, patch: any) {
  const { data, error } = await getClient().from('graveyards').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGraveyard(id: string) {
  const { error } = await getClient().from('graveyards').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Plots ────────────────────────────────────────────────────────────────────

export async function listPlots(graveyardId?: string) {
  let query = getClient().from('plots').select('*, graveyards(name)').order('created_at', { ascending: false });
  if (graveyardId) query = query.eq('graveyard_id', graveyardId);
  const { data } = await query;
  return data ?? [];
}

export async function getPlotById(id: string) {
  const { data } = await getClient().from('plots').select('*, graveyards(name)').eq('id', id).single();
  return data;
}

export async function createPlot(p: any) {
  const { data, error } = await getClient().from('plots').insert(p).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlot(id: string, patch: any) {
  const { data, error } = await getClient().from('plots').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePlot(id: string) {
  const { error } = await getClient().from('plots').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function countAvailablePlots() {
  const { count } = await getClient().from('plots').select('*', { count: 'exact', head: true }).eq('status', 'available');
  return count ?? 0;
}

// ─── Service Providers ────────────────────────────────────────────────────────

export async function listProviders(type?: string) {
  let query = getClient().from('service_providers').select('*').order('created_at', { ascending: false });
  if (type) query = query.eq('type', type);
  const { data } = await query;
  return data ?? [];
}

export async function getProviderById(id: string) {
  const { data } = await getClient().from('service_providers').select('*').eq('id', id).single();
  return data;
}

export async function createProvider(p: any) {
  const { data, error } = await getClient().from('service_providers').insert(p).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProvider(id: string, patch: any) {
  const { data, error } = await getClient().from('service_providers').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProvider(id: string) {
  const { error } = await getClient().from('service_providers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getBookings(userId?: string) {
  let query = getClient()
    .from('bookings')
    .select('*, users(name, email), graveyards(name), plots(plot_code), service_providers(name)')
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return data ?? [];
}

export async function getBookingById(id: string) {
  const { data } = await getClient()
    .from('bookings')
    .select('*, users(name, email), graveyards(name), plots(plot_code), service_providers(name)')
    .eq('id', id).single();
  return data;
}

export async function createBooking(booking: any) {
  const { data, error } = await getClient().from('bookings').insert(booking).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateBooking(id: string, patch: any) {
  const { data, error } = await getClient().from('bookings').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBooking(id: string) {
  const { error } = await getClient().from('bookings').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function countTodayBookings() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { count } = await getClient()
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString());
  return count ?? 0;
}

export async function countPendingBookings() {
  const { count } = await getClient()
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

export async function revenueThisMonth() {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await getClient()
    .from('bookings')
    .select('amount')
    .gte('created_at', start.toISOString())
    .in('status', ['confirmed', 'completed']);
  if (!data) return 0;
  return data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
}

// ─── Deceased Records ─────────────────────────────────────────────────────────

export async function listDeceased(search?: string) {
  let query = getClient().from('deceased_records').select('*, plots(plot_code, graveyards(name))').order('created_at', { ascending: false });
  if (search) query = query.ilike('full_name', `%${search}%`);
  const { data } = await query;
  return data ?? [];
}

export async function getDeceasedById(id: string) {
  const { data } = await getClient().from('deceased_records').select('*, plots(plot_code, graveyards(name))').eq('id', id).single();
  return data;
}

export async function createDeceased(d: any) {
  const { data, error } = await getClient().from('deceased_records').insert(d).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDeceased(id: string, patch: any) {
  const { data, error } = await getClient().from('deceased_records').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDeceased(id: string) {
  const { error } = await getClient().from('deceased_records').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function createPayment(payment: any) {
  const { data } = await getClient().from('payments').insert(payment).select().single();
  return data;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(userId: string) {
  const { data } = await getClient()
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function markNotificationRead(notifId: string, userId: string) {
  const { error } = await getClient()
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function saveNotification(userId: string, title: string, body: string, type: string, bookingId?: string) {
  await getClient().from('notifications').insert({
    id: uuidv4(),
    user_id: userId,
    title,
    body,
    type,
    booking_id: bookingId || null,
    read: false,
  });
}
