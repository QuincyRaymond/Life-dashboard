const { ebFetch } = require('../lib/enablebanking');

module.exports = async function handler(req, res) {
  try {
    const country = (req.query.country || 'NL').toUpperCase();
    const data = await ebFetch('/aspsps?country=' + encodeURIComponent(country));
    const aspsps = (data.aspsps || []).map(function (a) {
      return {
        name: a.name,
        country: a.country,
        logo: a.logo || null,
        maximum_consent_validity: a.maximum_consent_validity != null ? a.maximum_consent_validity : null
      };
    });
    res.status(200).json({ aspsps: aspsps });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
