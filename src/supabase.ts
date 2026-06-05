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
  const [{ data: graveyards }, { data: plots }] = await Promise.all([
    getClient().from('graveyards').select('*').order('created_at', { ascending: false }),
    getClient().from('plots').select('graveyard_id, status'),
  ]);

  const countMap: Record<string, { available: number; total: number }> = {};
  for (const p of plots ?? []) {
    if (!countMap[p.graveyard_id]) countMap[p.graveyard_id] = { available: 0, total: 0 };
    countMap[p.graveyard_id].total++;
    if (p.status === 'available') countMap[p.graveyard_id].available++;
  }

  return (graveyards ?? []).map((g: any) => ({
    ...g,
    available_plots: countMap[g.id]?.available ?? g.available_plots ?? 0,
    total_plots: countMap[g.id]?.total ?? g.total_plots ?? 0,
  }));
}

export async function getGraveyardById(id: string) {
  const [{ data: g }, { data: plots }] = await Promise.all([
    getClient().from('graveyards').select('*').eq('id', id).single(),
    getClient().from('plots').select('status').eq('graveyard_id', id),
  ]);
  if (!g) return null;
  const plotList = plots ?? [];
  return {
    ...g,
    available_plots: plotList.filter((p: any) => p.status === 'available').length,
    total_plots: plotList.length,
  };
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
  // Use select('*') only — graveyards/plots/service_providers have no FK columns on
  // bookings so PostgREST returns an error for those joins, silently giving back null.
  // All user-facing data (name, service, etc.) is already in the meta JSON column.
  let query = getClient()
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return data ?? [];
}

export async function getBookingById(id: string) {
  const { data } = await getClient()
    .from('bookings')
    .select('*')
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
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { count } = await getClient()
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('created_at', since.toISOString());
  return count ?? 0;
}

export async function revenueThisMonth() {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await getClient()
    .from('bookings')
    .select('amount, meta')
    .gte('created_at', start.toISOString())
    .in('status', ['paid', 'confirmed', 'completed']);
  if (!data) return 0;
  return data.reduce((s: number, r: any) => s + (Number(r.meta?.price || r.amount) || 0), 0);
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

// ─── Avatar Storage ───────────────────────────────────────────────────────────

const AVATAR_BUCKET = 'avatars';

async function ensureAvatarBucket() {
  const client = getClient();
  const { data: buckets } = await client.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === AVATAR_BUCKET);
  if (!exists) {
    await client.storage.createBucket(AVATAR_BUCKET, { public: true });
  }
}

export async function uploadAvatar(userId: string, buffer: Buffer, mimetype: string, ext: string): Promise<string> {
  const client = getClient();
  await ensureAvatarBucket();
  const filename = `${userId}/avatar${ext}`;
  const { error } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

const PROVIDER_IMAGE_BUCKET = 'provider-images';

export async function uploadProviderImage(providerId: string, buffer: Buffer, mimetype: string, ext: string): Promise<string> {
  const client = getClient();
  const { data: buckets } = await client.storage.listBuckets();
  if (!buckets?.some((b) => b.name === PROVIDER_IMAGE_BUCKET)) {
    await client.storage.createBucket(PROVIDER_IMAGE_BUCKET, { public: true });
  }
  const filename = `${providerId}/image${ext}`;
  const { error } = await client.storage
    .from(PROVIDER_IMAGE_BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(PROVIDER_IMAGE_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
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

// ─── Support Queries ──────────────────────────────────────────────────────────

export async function createSupportQuery(q: { name: string; email: string; message: string }) {
  const { data, error } = await getClient().from('support_queries').insert(q).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listSupportQueries() {
  const { data } = await getClient()
    .from('support_queries')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function resolveSupportQuery(id: string) {
  const { data, error } = await getClient()
    .from('support_queries')
    .update({ status: 'resolved' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
