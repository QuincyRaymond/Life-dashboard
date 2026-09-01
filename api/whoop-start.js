const crypto = require('crypto');
const { verifySupabaseOwner } = require('../lib/enablebanking');
const { buildAuthorizationUrl, patchWhoopConnection } = require('../lib/whoop');

const WHOOP_CALLBACK_URL = 'https://life-dashboard-five-pi.vercel.app/api/whoop-callback';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const isOwner = await verifySupabaseOwner(req);
  if (!isOwner) {
    res.status(401).json({ error: 'Unauthorized' });
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
