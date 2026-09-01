const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

// WHOOP only issues a refresh_token if the 'offline' scope is requested —
// without it the access token can't be renewed once it expires (~1h) and
// the daily cron sync would silently stop working after day one.
const WHOOP_SCOPES = [
  'read:sleep', 'read:recovery', 'read:cycles', 'read:workout',
  'read:profile', 'read:body_measurement', 'offline'
];

const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';

function supaServiceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

async function getWhoopConnection() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/whoop_connection?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaServiceHeaders())
  });
  if (res.status !== 200) return null;
  return res.json();
}

async function patchWhoopConnection(payload) {
  await fetch(SUPABASE_URL + '/rest/v1/whoop_connection?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaServiceHeaders()),
    body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, payload))
  });
}

function buildAuthorizationUrl(redirectUri, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES.join(' '),
    state: state
  });
  return WHOOP_AUTH_URL + '?' + params.toString();
}

async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET
    }).toString()
  });
  if (!res.ok) throw new Error('WHOOP token exchange failed: ' + await res.text());
  return res.json();
}

// WHOOP rotates the refresh token on every use — the previous one stops
// working, so the response's refresh_token must always overwrite the
// stored one or the *next* refresh will fail.
async function refreshTokens(refreshToken) {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: 'offline'
    }).toString()
  });
  if (!res.ok) throw new Error('WHOOP token refresh failed: ' + await res.text());
  return res.json();
}

async function whoopFetch(path, accessToken) {
  const res = await fetch(WHOOP_API_BASE + path, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) throw new Error('WHOOP API error (' + res.status + '): ' + await res.text());
  return res.json();
}

async function getValidAccessToken(connection) {
  const now = Date.now();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > now + 60000) return connection.access_token;

  const refreshed = await refreshTokens(connection.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await patchWhoopConnection({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    token_expires_at: tokenExpiresAt
  });
  return refreshed.access_token;
}

async function upsertRecovery(recovery, strain) {
  if (!recovery || !recovery.score) return;
  const row = {
    whoop_cycle_id: recovery.cycle_id,
    recovery_score: recovery.score.recovery_score != null ? recovery.score.recovery_score : null,
    hrv_rmssd_milli: recovery.score.hrv_rmssd_milli != null ? recovery.score.hrv_rmssd_milli : null,
    resting_heart_rate: recovery.score.resting_heart_rate != null ? recovery.score.resting_heart_rate : null,
    strain: strain != null ? strain : null,
    recorded_at: recovery.created_at || null
  };
  const res = await fetch(SUPABASE_URL + '/rest/v1/whoop_recovery?on_conflict=whoop_cycle_id', {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      supaServiceHeaders()
    ),
    body: JSON.stringify([row])
  });
  if (!res.ok) throw new Error('Supabase whoop_recovery upsert failed: ' + await res.text());
}

async function upsertSleep(sleep) {
  if (!sleep || !sleep.score) return;
  const stageSummary = sleep.score.stage_summary || null;
  const totalSleepMilli = stageSummary
    ? (stageSummary.total_in_bed_time_milli || 0) - (stageSummary.total_awake_time_milli || 0)
    : null;
  const row = {
    whoop_sleep_id: sleep.id,
    sleep_performance_percentage: sleep.score.sleep_performance_percentage != null ? sleep.score.sleep_performance_percentage : null,
    total_sleep_time_milli: totalSleepMilli,
    stage_summary: stageSummary,
    start_time: sleep.start || null,
    end_time: sleep.end || null
  };
  const res = await fetch(SUPABASE_URL + '/rest/v1/whoop_sleep?on_conflict=whoop_sleep_id', {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      supaServiceHeaders()
    ),
    body: JSON.stringify([row])
  });
  if (!res.ok) throw new Error('Supabase whoop_sleep upsert failed: ' + await res.text());
}

// Shared by api/whoop-sync.js (a manually-triggerable, CRON_SECRET protected
// endpoint) and api/strava-sync.js (which calls this too, so WHOOP syncing
// rides the same daily cron trigger instead of needing its own — see the
// comment in strava-sync.js for why).
async function syncWhoopData() {
  const connection = await getWhoopConnection();
  if (!connection || connection.status !== 'connected' || !connection.refresh_token) {
    return { skipped: true, reason: 'No active WHOOP connection' };
  }

  try {
    const accessToken = await getValidAccessToken(connection);

    const [recoveryData, sleepData, cycleData] = await Promise.all([
      whoopFetch('/v2/recovery?limit=1', accessToken),
      whoopFetch('/v2/activity/sleep?limit=1', accessToken),
      whoopFetch('/v2/cycle?limit=1', accessToken)
    ]);

    const recovery = (recoveryData.records || [])[0] || null;
    const sleep = (sleepData.records || [])[0] || null;
    const cycle = (cycleData.records || [])[0] || null;
    const strain = cycle && cycle.score ? cycle.score.strain : null;

    await upsertRecovery(recovery, strain);
    await upsertSleep(sleep);
    await patchWhoopConnection({ status: 'connected', last_error: null, last_synced_at: new Date().toISOString() });

    return { syncedRecovery: !!recovery, syncedSleep: !!sleep };
  } catch (e) {
    await patchWhoopConnection({ last_error: e.message }).catch(function () {});
    throw e;
  }
}

module.exports = {
  WHOOP_SCOPES,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getWhoopConnection,
  patchWhoopConnection,
  syncWhoopData
};
