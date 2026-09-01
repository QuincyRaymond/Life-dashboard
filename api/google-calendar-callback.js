const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';
const GOOGLE_CALLBACK_URL = 'https://life-dashboard-five-pi.vercel.app/api/google-calendar-callback';
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

async function getTokensRow() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaHeaders())
  });
  if (res.status !== 200) return null;
  return res.json();
}

async function patchTokens(payload) {
  await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify(payload)
  });
}

async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code'
    }).toString()
  });
  if (!res.ok) throw new Error('Google token exchange failed: ' + await res.text());
  return res.json();
}

module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    await patchTokens({ pending_state: null, last_error: String(error_description || error) });
    res.status(200).send(page('Koppeling geannuleerd', String(error_description || error), false));
    return;
  }

  try {
    const existing = await getTokensRow();
    if (!existing || !state || existing.pending_state !== state) {
      res.status(400).send(page('Koppeling mislukt', 'De state kwam niet overeen. Probeer het opnieuw vanuit het dashboard.', false));
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Shouldn't happen with prompt=consent, but without a refresh_token
      // the connection would silently break again the next time the
      // short-lived access_token expires.
      throw new Error('Google gaf geen refresh_token terug — probeer het opnieuw.');
    }

    await patchTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      pending_state: null,
      last_error: null
    });

    res.status(200).send(page('Google Calendar opnieuw gekoppeld!', 'Je agenda wordt weer automatisch opgehaald.', true));
  } catch (e) {
    console.error(e);
    await patchTokens({ pending_state: null, last_error: e.message }).catch(function () {});
    res.status(200).send(page('Koppeling mislukt', 'Er ging iets mis bij het koppelen: ' + e.message, false));
  }
};
