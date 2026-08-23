const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

function getWeekStart(d) {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

async function getTokens() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaHeaders())
  });
  if (res.status === 200) return res.json();

  const bootstrap = {
    id: true,
    access_token: '',
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    expires_at: 0
  };
  await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify(bootstrap)
  });
  return bootstrap;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });
  if (!res.ok) throw new Error('Google token refresh failed: ' + await res.text());
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in
  };
}

async function saveTokens(tokens) {
  await fetch(SUPABASE_URL + '/rest/v1/google_calendar_tokens?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at
    })
  });
}

module.exports = async function handler(req, res) {
  try {
    let start, end;
    if (req.query.start && req.query.end) {
      start = new Date(req.query.start + 'T00:00:00Z');
      end = new Date(req.query.end + 'T00:00:00Z');
    } else {
      start = getWeekStart(new Date());
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
    }
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Invalid start/end date' });
      return;
    }

    let tokens = await getTokens();
    const now = Math.floor(Date.now() / 1000);
    if (!tokens.expires_at || tokens.expires_at <= now + 60) {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await saveTokens(tokens);
    }

    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    });
    const evRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + params.toString(), {
      headers: { Authorization: 'Bearer ' + tokens.access_token }
    });
    if (!evRes.ok) throw new Error('Google Calendar fetch failed: ' + await evRes.text());
    const data = await evRes.json();

    const events = (data.items || []).map(function (e) {
      return {
        id: e.id,
        summary: e.summary || '(geen titel)',
        location: e.location || null,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        allDay: !e.start.dateTime
      };
    });

    res.status(200).json({ start: start.toISOString(), end: end.toISOString(), events: events });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
