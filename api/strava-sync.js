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

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
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

    res.status(200).json({ synced: withCalories.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
