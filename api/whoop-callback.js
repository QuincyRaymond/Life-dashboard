const { exchangeCodeForTokens, getWhoopConnection, patchWhoopConnection, syncWhoopData } = require('../lib/whoop');

const DASHBOARD_URL = 'https://life-dashboard-five-pi.vercel.app/';
const WHOOP_CALLBACK_URL = 'https://life-dashboard-five-pi.vercel.app/api/whoop-callback';

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

module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    await patchWhoopConnection({ status: 'error', last_error: String(error_description || error), pending_state: null });
    res.status(200).send(page('Koppeling geannuleerd', String(error_description || error), false));
    return;
  }

  try {
    const connection = await getWhoopConnection();
    if (!connection || !state || connection.pending_state !== state) {
      res.status(400).send(page('Koppeling mislukt', 'De state kwam niet overeen. Probeer het opnieuw vanuit het dashboard.', false));
      return;
    }

    const tokens = await exchangeCodeForTokens(code, WHOOP_CALLBACK_URL);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await patchWhoopConnection({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
      status: 'connected',
      pending_state: null,
      last_error: null
    });

    // Populate the Sleep card right away instead of waiting for tomorrow's cron.
    await syncWhoopData().catch(function (e) { console.error('Initial WHOOP sync failed', e); });

    res.status(200).send(page('WHOOP gekoppeld!', 'Je recovery, slaap en strain worden vanaf nu dagelijks automatisch opgehaald.', true));
  } catch (e) {
    console.error(e);
    await patchWhoopConnection({ status: 'error', last_error: e.message, pending_state: null }).catch(function () {});
    res.status(200).send(page('Koppeling mislukt', 'Er ging iets mis bij het koppelen: ' + e.message, false));
  }
};
