const crypto = require('crypto');
const { buildAuthorizationUrl, getWhoopConnection, patchWhoopConnection } = require('../lib/whoop');

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
    const existing = await getWhoopConnection();
    // The "Koppel WHOOP" button shouldn't be visible once already connected
    // (see loadWhoopData in index.html), but a stale tab or a duplicate
    // click could still reach this endpoint. Without this guard, a second
    // start call resets pending_state/status on a connection that's already
    // working — status flips to 'pending' even though the existing
    // access/refresh tokens are still perfectly valid, and the Sleep card
    // wrongly falls back to showing the connect button.
    if (existing && existing.status === 'connected' && existing.access_token && existing.refresh_token) {
      res.status(200).json({ alreadyConnected: true });
      return;
    }

    const state = crypto.randomUUID();
    await patchWhoopConnection({ pending_state: state, status: 'pending', last_error: null });
    res.status(200).json({ url: buildAuthorizationUrl(WHOOP_CALLBACK_URL, state) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
