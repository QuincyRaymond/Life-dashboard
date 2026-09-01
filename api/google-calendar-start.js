const crypto = require('crypto');

const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CALLBACK_URL = 'https://life-dashboard-five-pi.vercel.app/api/google-calendar-callback';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

async function patchTokens(payload) {
  await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify(payload)
  });
}

// Rebuilds the OAuth start step that was originally done manually (the old
// refresh token was bootstrapped straight into GOOGLE_REFRESH_TOKEN, no
// in-app flow) — same pattern as api/whoop-start.js. No Supabase-auth gate:
// the Dashboard tab has no login, same as the rest of the app besides
// Finance.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const state = crypto.randomUUID();
    await patchTokens({ pending_state: state, last_error: null });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_CALLBACK_URL,
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      // Google only hands back a refresh_token on a user's *first* consent
      // by default. This is a re-auth after the old one expired/was
      // revoked, so prompt=consent forces a fresh one every time — without
      // it the reconnect would silently fail to fix anything.
      prompt: 'consent',
      state: state
    });

    res.status(200).json({ url: GOOGLE_AUTH_URL + '?' + params.toString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
