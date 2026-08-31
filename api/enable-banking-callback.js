const { ebFetch } = require('../lib/enablebanking');

const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';
const DASHBOARD_URL = 'https://life-dashboard-five-pi.vercel.app/';

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

function page(title, message, ok) {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<title>' + title + '</title>' +
    '<style>body{background:#050506;color:#FAFAFA;font-family:-apple-system,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}' +
    '.box{max-width:420px;} h1{font-size:20px;} p{color:#B8B6B0;line-height:1.5;}' +
    'a{color:' + (ok ? '#3A96FF' : '#FF6B6B') + ';font-weight:700;text-decoration:none;}</style>' +
    '</head><body><div class="box"><h1>' + title + '</h1><p>' + message + '</p>' +
    '<p><a href="' + DASHBOARD_URL + '">Terug naar dashboard</a></p></div></body></html>'
  );
}

async function getConnection() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/bank_connection?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaHeaders())
  });
  if (!res.ok) return null;
  return res.json();
}

async function patchConnection(payload) {
  await fetch(SUPABASE_URL + '/rest/v1/bank_connection?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, payload))
  });
}

async function upsertAccounts(accounts) {
  if (!accounts.length) return;
  const rows = accounts.map(function (a) {
    return {
      account_uid: a.uid,
      iban: a.account_id && a.account_id.iban ? a.account_id.iban : null,
      name: a.name || null,
      currency: a.currency || null,
      cash_account_type: a.cash_account_type || null
    };
  });
  await fetch(SUPABASE_URL + '/rest/v1/bank_accounts?on_conflict=account_uid', {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      supaHeaders()
    ),
    body: JSON.stringify(rows)
  });
}

module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    await patchConnection({ status: 'error', last_error: String(error_description || error), pending_state: null });
    res.status(200).send(page('Koppeling geannuleerd', String(error_description || error), false));
    return;
  }

  try {
    const connection = await getConnection();
    if (!connection || !state || connection.pending_state !== state) {
      res.status(400).send(page('Koppeling mislukt', 'De state kwam niet overeen. Probeer het opnieuw vanuit het dashboard.', false));
      return;
    }

    const session = await ebFetch('/sessions', { method: 'POST', body: { code: code } });
    await upsertAccounts(session.accounts || []);
    await patchConnection({
      session_id: session.session_id,
      access_valid_until: session.access && session.access.valid_until ? session.access.valid_until : null,
      status: 'connected',
      pending_state: null,
      last_error: null
    });

    res.status(200).send(page('Bankrekening gekoppeld!', 'Je transacties en saldo worden vanaf nu dagelijks automatisch opgehaald.', true));
  } catch (e) {
    console.error(e);
    await patchConnection({ status: 'error', last_error: e.message, pending_state: null }).catch(function () {});
    res.status(200).send(page('Koppeling mislukt', 'Er ging iets mis bij het koppelen: ' + e.message, false));
  }
};
