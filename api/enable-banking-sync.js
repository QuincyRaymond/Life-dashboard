const { syncBankData } = require('../lib/enablebanking');

// This endpoint is NOT on its own Vercel Cron schedule — see the comment in
// api/strava-sync.js. It's a manually-triggerable copy of the same daily
// bank sync (protected by CRON_SECRET, same as the Strava cron) for
// debugging without waiting for the schedule.
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await syncBankData();
    res.status(200).json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
