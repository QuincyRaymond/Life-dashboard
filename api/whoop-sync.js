const { syncWhoopData } = require('../lib/whoop');

// Not on its own Vercel Cron schedule — see the comment in
// api/strava-sync.js. A manually-triggerable copy of the same daily WHOOP
// sync (protected by CRON_SECRET, same as the Strava cron) for debugging
// without waiting for the schedule.
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await syncWhoopData();
    res.status(200).json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
