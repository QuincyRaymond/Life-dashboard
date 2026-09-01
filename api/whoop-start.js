const crypto = require('crypto');
const { buildAuthorizationUrl, patchWhoopConnection } = require('../lib/whoop');

const WHOOP_CALLBACK_URL = 'https://life-dashboard-five-pi.vercel.app/api/whoop-callback';

// Unlike the Finance tab's Enable Banking flow, this deliberately has no
// Supabase-auth gate — the Health tab has no separate login, so connecting
// WHOOP works the same way the rest of that tab already does (no auth).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const state = crypto.randomUUID();
    await patchWhoopConnection({ pending_state: state, status: 'pending', last_error: null });
    res.status(200).json({ url: buildAuthorizationUrl(WHOOP_CALLBACK_URL, state) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
