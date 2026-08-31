const crypto = require('crypto');

const EB_BASE_URL = 'https://api.enablebanking.com';

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Enable Banking authorizes API requests with a JWT signed by the private
// key downloaded from their dashboard (RS256), keyed by the Application ID.
// See https://enablebanking.com/docs — max token TTL is 24h; we mint a
// short-lived one per call instead of caching/reusing.
function signEnableBankingJWT() {
  const appId = process.env.ENABLEBANKING_APP_ID;
  const privateKey = (process.env.ENABLEBANKING_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 300 };

  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(privateKey));

  return signingInput + '.' + signature;
}

async function ebFetch(path, options) {
  const opts = options || {};
  const res = await fetch(EB_BASE_URL + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { Authorization: 'Bearer ' + signEnableBankingJWT(), 'Content-Type': 'application/json' },
      opts.headers || {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('Enable Banking API error (' + res.status + '): ' + text);
    err.status = res.status;
    throw err;
  }
  return data;
}

// maximum_consent_validity from /aspsps can show up as a number of seconds
// or an ISO-8601 duration (e.g. "P90D") depending on the ASPSP — handle both,
// falling back to 90 days if it's missing or unparseable.
function computeValidUntil(maximumConsentValidity) {
  const DAY = 24 * 3600 * 1000;
  const DEFAULT_MS = 90 * DAY;
  let ms = DEFAULT_MS;

  if (typeof maximumConsentValidity === 'number' && maximumConsentValidity > 0) {
    ms = maximumConsentValidity * 1000;
  } else if (typeof maximumConsentValidity === 'string') {
    const match = maximumConsentValidity.match(/^P(?:(\d+)D)?/);
    if (match && match[1]) ms = parseInt(match[1], 10) * DAY;
  }

  ms = Math.min(ms, 180 * DAY);
  return new Date(Date.now() + ms).toISOString();
}

// This is the same publishable/anon key already embedded in the public
// index.html — it's not a secret, just required by Supabase's auth REST API
// alongside the user's own bearer token to identify which project to check.
const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5BL3gNtUjmCqxgKpYt6qFg_K88jbiAh';

async function verifySupabaseOwner(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY }
  });
  if (!res.ok) return false;
  const user = await res.json();
  return user && user.email === 'qdvlugt@hotmail.com';
}

function supaServiceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

async function getBankConnection() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/bank_connection?id=eq.true&select=*', {
    headers: Object.assign({ Accept: 'application/vnd.pgrst.object+json' }, supaServiceHeaders())
  });
  if (res.status !== 200) return null;
  return res.json();
}

async function patchBankConnection(payload) {
  await fetch(SUPABASE_URL + '/rest/v1/bank_connection?id=eq.true', {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaServiceHeaders()),
    body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, payload))
  });
}

async function getBankAccountUids() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/bank_accounts?select=account_uid', { headers: supaServiceHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function upsertBalances(accountUid, balances) {
  if (!balances.length) return;
  const rows = balances.map(function (b) {
    return {
      account_uid: accountUid,
      balance_type: b.balance_type || null,
      amount: b.balance_amount ? Number(b.balance_amount.amount) : null,
      currency: b.balance_amount ? b.balance_amount.currency : null,
      reference_date: b.reference_date || null
    };
  });
  await fetch(SUPABASE_URL + '/rest/v1/bank_balances', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaServiceHeaders()),
    body: JSON.stringify(rows)
  });
}

async function fetchAllTransactions(accountUid, dateFrom, dateTo) {
  let all = [];
  let continuationKey = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (continuationKey) params.set('continuation_key', continuationKey);
    const data = await ebFetch('/accounts/' + encodeURIComponent(accountUid) + '/transactions?' + params.toString());
    all = all.concat(data.transactions || []);
    continuationKey = data.continuation_key || null;
    if (!continuationKey) break;
  }
  return all;
}

async function upsertTransactions(accountUid, transactions) {
  if (!transactions.length) return;
  const rows = transactions.map(function (t) {
    const amount = t.transaction_amount || t.amount || {};
    return {
      account_uid: accountUid,
      transaction_id: t.transaction_id || t.entry_reference || (accountUid + ':' + t.booking_date + ':' + amount.amount),
      booking_date: t.booking_date || null,
      amount: amount.amount != null ? Number(amount.amount) : null,
      currency: amount.currency || null,
      creditor_name: t.creditor_name || (t.creditor && t.creditor.name) || null,
      debtor_name: t.debtor_name || (t.debtor && t.debtor.name) || null,
      remittance_info: Array.isArray(t.remittance_information)
        ? t.remittance_information.join(' ')
        : (t.remittance_information_unstructured || null),
      raw: t
    };
  });
  await fetch(SUPABASE_URL + '/rest/v1/bank_transactions?on_conflict=account_uid,transaction_id', {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      supaServiceHeaders()
    ),
    body: JSON.stringify(rows)
  });
}

// Shared by api/enable-banking-sync.js (a manually-triggerable, CRON_SECRET
// protected endpoint) and api/strava-sync.js (which calls this too, so bank
// syncing rides the same daily cron trigger instead of needing its own —
// see the comment in strava-sync.js for why).
async function syncBankData() {
  const connection = await getBankConnection();
  if (!connection || connection.status !== 'connected' || !connection.session_id) {
    return { skipped: true, reason: 'No active bank connection' };
  }

  if (connection.access_valid_until && new Date(connection.access_valid_until) < new Date()) {
    await patchBankConnection({ status: 'expired', last_error: 'Toegang verlopen, log opnieuw in bij je bank.' });
    return { skipped: true, reason: 'Consent expired' };
  }

  const accounts = await getBankAccountUids();
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  let syncedAccounts = 0;
  let syncedTransactions = 0;

  for (const account of accounts) {
    const uid = account.account_uid;
    const balancesData = await ebFetch('/accounts/' + encodeURIComponent(uid) + '/balances');
    await upsertBalances(uid, balancesData.balances || []);

    const transactions = await fetchAllTransactions(uid, dateFrom, dateTo);
    await upsertTransactions(uid, transactions);

    syncedAccounts++;
    syncedTransactions += transactions.length;
  }

  await patchBankConnection({ status: 'connected', last_error: null });
  return { syncedAccounts: syncedAccounts, syncedTransactions: syncedTransactions };
}

module.exports = { ebFetch, computeValidUntil, verifySupabaseOwner, syncBankData, EB_BASE_URL };
