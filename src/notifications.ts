import axios from 'axios';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(token: string, title: string, body: string, data: any = {}) {
  if (!token) return { ok: false, error: 'no token' };
  try {
    const resp = await axios.post(EXPO_PUSH_URL, { to: token, title, body, data }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
    return { ok: true, resp: resp.data };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sendMany(tokens: string[], title: string, body: string, data: any = {}) {
  const results: any[] = [];
  for (const t of tokens) {
    try {
      results.push(await sendExpoPush(t, title, body, data));
    } catch (e) {
      results.push({ ok: false, error: String(e) });
    }
  }
  return results;
}
