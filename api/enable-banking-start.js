const crypto = require('crypto');
const { ebFetch, computeValidUntil, verifySupabaseOwner } = require('../lib/enablebanking');

const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

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
    const { aspspName, aspspCountry, maximumConsentValidity } = req.body || {};
    if (!aspspName || !aspspCountry) {
      res.status(400).json({ error: 'aspspName and aspspCountry are required' });
      return;
    }

    const state = crypto.randomUUID();
    const callbackUrl = 'https://life-dashboard-five-pi.vercel.app/api/enable-banking-callback';

    const authRes = await ebFetch('/auth', {
      method: 'POST',
      body: {
        access: { valid_until: computeValidUntil(maximumConsentValidity) },
        aspsp: { name: aspspName, country: aspspCountry },
        state: state,
        redirect_url: callbackUrl,
        psu_type: 'personal'
      }
    });

    await fetch(SUPABASE_URL + '/rest/v1/bank_connection?id=eq.true', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
      body: JSON.stringify({
        pending_state: state,
        aspsp_name: aspspName,
        aspsp_country: aspspCountry,
        authorization_id: authRes.authorization_id,
        status: 'pending',
        last_error: null,
        updated_at: new Date().toISOString()
      })
    });

    res.status(200).json({ url: authRes.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
