// Función serverless de Vercel: reenvía las peticiones de la app a la API de Anthropic.
// La clave nunca llega al teléfono: vive en la variable de entorno ANTHROPIC_API_KEY.
const MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'method'});
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({error: 'nokey'});
  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers['x-app-password'] !== pass) return res.status(401).json({error: 'auth'});

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!Array.isArray(b.messages)) return res.status(400).json({error: 'messages'});
  const body = {
    model: MODELS.includes(b.model) ? b.model : MODELS[1],
    max_tokens: Math.min(Number(b.max_tokens) || 1500, 2000),
    system: typeof b.system === 'string' ? b.system : undefined,
    messages: b.messages
  };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({error: (j.error && j.error.message) || 'upstream'});
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return res.status(200).json({text});
  } catch (e) {
    return res.status(502).json({error: 'network'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '4mb'}}};
