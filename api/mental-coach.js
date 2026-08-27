const SUPABASE_URL = 'https://atsusphjcgrxgfeejhex.supabase.co';
const COOLDOWN_MS = 15 * 60 * 1000;

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key };
}

async function getLastFeedback() {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/coach_feedback?select=created_at&order=created_at.desc&limit=1',
    { headers: supaHeaders() }
  );
  if (!res.ok) throw new Error('Supabase read failed: ' + await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function saveFeedback(concern, message) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/coach_feedback', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, supaHeaders()),
    body: JSON.stringify({ concern: concern, message: message })
  });
  if (!res.ok) throw new Error('Supabase insert failed: ' + await res.text());
}

const SYSTEM_PROMPT = [
  'Je bent een ondersteunende, warme reflectie-assistent binnen een persoonlijke journaling-app.',
  'Je krijgt recente dagboek-entries, dagelijkse stemmingsscores (1-5) en dankbaarheids-items van de gebruiker over de afgelopen periode.',
  '',
  'Jouw taak bij een normale reflectie:',
  '- Geef een korte, warme reflectie (maximaal ongeveer 150 woorden).',
  '- Benoem patronen als je ze ziet (terugkerende thema\'s, stemmingsveranderingen, dingen die energie lijken te geven of te kosten) — beschrijvend en voorzichtig geformuleerd, nooit als diagnose, label, of stellige conclusie.',
  '- Stel een of meer open vragen die de gebruiker uitnodigen om zelf verder na te denken, in plaats van zelf conclusies of oordelen te geven.',
  '- Je bent geen therapeut: je stelt geen diagnoses, je "behandelt" niets, en je claimt geen expertise die je niet hebt.',
  '- Schrijf in het Nederlands, warm maar niet zoetsappig, en spreek de gebruiker rechtstreeks aan ("je").',
  '',
  'KRITISCHE VEILIGHEIDSREGEL — beoordeel dit altijd eerst, voor al het bovenstaande:',
  'Als de entries ook maar enige aanwijzing geven van acute nood, gedachtes aan zelfbeschadiging, zelfmoord, of een crisis — twijfel gerust in het voordeel van voorzichtigheid bij subtiele signalen — geef dan GEEN normale reflectie en probeer NIETS zelf therapeutisch op te lossen of te behandelen.',
  'Reageer in plaats daarvan kalm, zonder paniek en zonder drama, erken kort wat je leest, en verwijs actief door naar professionele hulp. Neem in dat geval in je boodschap op:',
  '- 113 Zelfmoordpreventie: bel 0800-0113 (gratis, 24/7) of chat via 113.nl',
  '- Bij direct gevaar: bel 112',
  '- Anders: moedig aan om contact op te nemen met een huisarts of iemand die ze vertrouwen',
  'Zet in dit geval concern op true. Sla anders de normale reflectie-structuur helemaal over — dit is de enige inhoud van je boodschap.',
  '',
  'Geef je antwoord altijd via de submit_reflection tool.'
].join('\n');

function buildUserContent(data) {
  const lines = ['Hier zijn mijn entries van de afgelopen periode.', ''];

  lines.push('Dagboek:');
  (data.journal || []).forEach(function (e) {
    if (e.text && e.text.trim()) lines.push('- ' + e.date + ': ' + e.text.trim());
  });
  if (!(data.journal || []).length) lines.push('(geen dagboek-entries)');

  lines.push('', 'Stemming (schaal 1-5):');
  (data.mood || []).forEach(function (m) {
    lines.push('- ' + m.date + ': ' + m.score + '/5');
  });
  if (!(data.mood || []).length) lines.push('(geen stemmingsdata)');

  lines.push('', 'Dankbaarheid:');
  (data.gratitude || []).forEach(function (g) {
    const items = (g.items || []).filter(function (i) { return i && i.trim(); });
    if (items.length) lines.push('- ' + g.date + ': ' + items.join('; '));
  });
  if (!(data.gratitude || []).length) lines.push('(geen dankbaarheid-entries)');

  return lines.join('\n');
}

async function askClaude(userContent) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      tools: [{
        name: 'submit_reflection',
        description: 'Submit the reflection response for the journaling coach.',
        input_schema: {
          type: 'object',
          properties: {
            concern: {
              type: 'boolean',
              description: 'True if the entries show any sign of crisis, self-harm ideation, or acute distress requiring a professional-help redirect instead of a normal reflection.'
            },
            message: {
              type: 'string',
              description: 'The reflection or, if concern is true, the calm professional-help redirect — shown to the user, in Dutch.'
            }
          },
          required: ['concern', 'message']
        }
      }],
      tool_choice: { type: 'tool', name: 'submit_reflection' }
    })
  });
  if (!res.ok) throw new Error('Anthropic API failed: ' + await res.text());
  const data = await res.json();
  const toolUse = (data.content || []).filter(function (c) { return c.type === 'tool_use'; })[0];
  if (!toolUse) throw new Error('No tool_use block in Anthropic response');
  return toolUse.input;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const last = await getLastFeedback();
    if (last) {
      const elapsed = Date.now() - new Date(last.created_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        res.status(200).json({
          cooldown: true,
          retryAfterMinutes: Math.ceil((COOLDOWN_MS - elapsed) / 60000)
        });
        return;
      }
    }

    const userContent = buildUserContent(req.body || {});
    const result = await askClaude(userContent);
    const concern = !!result.concern;
    const message = String(result.message || '').trim();

    await saveFeedback(concern, message);

    res.status(200).json({ concern: concern, message: message });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
