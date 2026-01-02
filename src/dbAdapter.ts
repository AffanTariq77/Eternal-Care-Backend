import { isDBConnected } from './db';
import { isSupabaseConfigured } from './supabase';

/**
 * Decide whether to use Supabase REST as the primary adapter.
 * - If SUPABASE not configured -> false
 * - If FORCE_SUPABASE_REST=1 -> true
 * - Otherwise, prefer direct DB when available; otherwise use Supabase
 */
export function shouldUseSupabase(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (process.env.FORCE_SUPABASE_REST === '1') return true;
  const dbConnected = isDBConnected();
  return !dbConnected;
}

export function isFileFallbackDisabled(): boolean {
  return process.env.DISABLE_FILE_FALLBACK === '1';
}
