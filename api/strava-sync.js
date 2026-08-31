const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

async function getTokens() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/strava_tokens?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaHeaders())
  });
  if (res.status === 200) return res.json();

  const bootstrap = {
    id: true,
    access_token: '',
    refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    expires_at: 0
  };
  await fetch(SUPABASE_URL + '/rest/v1/strava_tokens', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify(bootstrap)
  });
  return bootstrap;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });
  if (!res.ok) throw new Error('Strava token refresh failed: ' + await res.text());
  return res.json();
}

async function saveTokens(tokens) {
  await fetch(SUPABASE_URL + '/rest/v1/strava_tokens?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at
    })
  });
}

async function fetchActivities(accessToken) {
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) throw new Error('Strava activities fetch failed: ' + await res.text());
  return res.json();
}

async function fetchCalories(activityId, accessToken) {
  // The summary activities list doesn't include calories — only the
  // per-activity detail endpoint does, so this costs one extra request
  // per activity on every sync run.
  try {
    const res = await fetch('https://www.strava.com/api/v3/activities/' + activityId, {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) return null;
    const detail = await res.json();
    return detail.calories != null ? detail.calories : null;
  } catch (e) {
    return null;
  }
}

async function upsertActivities(activities) {
  if (!activities.length) return;
  const rows = activities.map(function (a) {
    return {
      strava_id: a.id,
      name: a.name,
      type: a.type,
      distance: a.distance,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      total_elevation_gain: a.total_elevation_gain,
      start_date: a.start_date,
      average_speed: a.average_speed,
      calories: a.calories != null ? a.calories : null
    };
  });
  const res = await fetch(SUPABASE_URL + '/rest/v1/strava_activities?on_conflict=strava_id', {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      supaHeaders()
    ),
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error('Supabase upsert failed: ' + await res.text());
}

function isScheduledAmsterdamHour() {
  // Vercel Cron always runs in UTC and has no timezone option, so this
  // function is triggered twice a day (02:00 and 03:00 UTC — see
  // vercel.json) and only actually syncs on the invocation that currently
  // lands on 04:00 in Europe/Amsterdam. That covers both CET (winter,
  // UTC+1) and CEST (summer, UTC+2) correctly, since Intl's timezone data
  // (unlike a static cron offset) already accounts for the DST switch.
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    hour12: false
  }).format(new Date());
  return parseInt(hour, 10) === 4;
}

async function runStravaSync() {
  let tokens = await getTokens();

  const now = Math.floor(Date.now() / 1000);
  if (!tokens.expires_at || tokens.expires_at <= now + 60) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    tokens = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at
    };
    await saveTokens(tokens);
  }

  const activities = await fetchActivities(tokens.access_token);
  const withCalories = await Promise.all(activities.map(function (a) {
    return fetchCalories(a.id, tokens.access_token).then(function (calories) {
      return Object.assign({}, a, { calories: calories });
    });
  }));
  await upsertActivities(withCalories);

  return { synced: withCalories.length };
}

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!isScheduledAmsterdamHour()) {
    res.status(200).json({ skipped: true, reason: 'Not 04:00 Europe/Amsterdam yet' });
    return;
  }

  const result = { strava: null, bank: null };

  try {
    result.strava = await runStravaSync();
  } catch (e) {
    console.error('Strava sync failed', e);
    result.strava = { error: e.message };
  }

  // Rides the same daily cron trigger as the Strava sync instead of having
  // its own — see supabase/enable_banking_schema.sql and
  // api/enable-banking-sync.js. Only runs once the bank tables/env vars
  // exist; a missing SUPABASE_SERVICE_ROLE_KEY-backed table just no-ops.
  try {
    const { syncBankData } = require('../lib/enablebanking');
    result.bank = await syncBankData();
  } catch (e) {
    console.error('Bank sync failed', e);
    result.bank = { error: e.message };
  }

  res.status(200).json(result);
};
