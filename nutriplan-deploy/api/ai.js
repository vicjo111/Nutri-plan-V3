// Vercel Serverless Function · POST /api/ai (analizar) · GET /api/ai (diagnóstico)
// La clave de Anthropic vive solo en Vercel (ANTHROPIC_API_KEY). Opcional: APP_PASSWORD.
const crypto = require('crypto');

const MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5'];
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SYSTEM = 'Eres un nutricionista experto en estimar porciones a partir de fotos y en cocina chilena, latinoamericana e internacional. Usa valores de tablas nutricionales estándar (USDA / tablas chilenas). Responde SOLO con JSON válido, sin texto adicional ni markdown.';
const SCHEMA = '{"dish":"nombre del plato en español","confidence":"alta|media|baja","items":[{"name":"componente en español","g":gramos,"kcal":n,"p":proteina_g,"c":carbohidratos_g,"fat":grasa_g}],"notes":"una frase breve con los supuestos (aceite, salsas, tamaño)"}';

const send = (res, status, obj) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (res, status, error, message) => send(res, status, {ok: false, error, message});

function passOk(req) {
  const want = process.env.APP_PASSWORD;
  if (!want) return true;
  let got = req.headers['x-app-password'] || '';
  const auth = req.headers.authorization || '';
  if (!got && auth.startsWith('Bearer ')) got = auth.slice(7);
  const a = Buffer.from(String(got)), b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

function prompt(hasImg, text) {
  return (hasImg
    ? 'Identifica el plato de la foto y cada componente visible por separado (proteína, guarnición, salsas, pan, bebida). Estima los gramos de cada uno usando como referencia el plato y los cubiertos, e incluye el aceite o aderezo probable.'
    : 'Estima la información nutricional de esta comida descomponiéndola en sus componentes con porciones típicas.')
    + (text ? '\nIndicaciones del usuario (tienen prioridad): ' + text : '')
    + '\nFormato: ' + SCHEMA
    + '\nSi no hay comida reconocible devuelve {"dish":"","items":[],"notes":"motivo"}.';
}

function clean(j) {
  const n = v => Math.max(0, Math.round(Number(v) || 0));
  const items = (Array.isArray(j.items) ? j.items : []).map(x => ({
    name: String(x.name || '').trim(), g: n(x.g), kcal: n(x.kcal), p: n(x.p), c: n(x.c), fat: n(x.fat != null ? x.fat : x.f)
  })).filter(x => x.name);
  const total = items.reduce((t, x) => ({kcal: t.kcal + x.kcal, p: t.p + x.p, c: t.c + x.c, fat: t.fat + x.fat}), {kcal: 0, p: 0, c: 0, fat: 0});
  return {dish: String(j.dish || '').trim(), confidence: ['alta', 'media', 'baja'].includes(j.confidence) ? j.confidence : 'media', notes: String(j.notes || '').trim(), items, total};
}

async function callAnthropic(key, model, content) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'},
    body: JSON.stringify({model, max_tokens: 1200, system: SYSTEM, messages: [{role: 'user', content}]})
  });
  const j = await r.json().catch(() => ({}));
  return {status: r.status, ok: r.ok, j};
}

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;

  if (req.method === 'GET') {
    return send(res, 200, {ok: true, hasKey: !!key, passwordRequired: !!process.env.APP_PASSWORD, passwordOk: passOk(req)});
  }
  if (req.method !== 'POST') return fail(res, 405, 'method', 'Método no permitido.');
  if (!key) return fail(res, 500, 'nokey', 'Falta la variable ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables) y volver a desplegar.');
  if (!passOk(req)) return fail(res, 401, 'auth', 'Contraseña de la IA incorrecta.');

  let b;
  try { b = await readBody(req); } catch (e) { return fail(res, 400, 'body', 'La petición no es JSON válido.'); }

  const text = typeof b.text === 'string' ? b.text.slice(0, 2000) : '';
  const img = b.image && typeof b.image.data === 'string' ? b.image : null;
  if (!text && !img) return fail(res, 400, 'empty', 'Envía una foto o una descripción.');
  if (img && !IMG_TYPES.includes(img.media_type)) return fail(res, 400, 'imgtype', 'Formato de imagen no compatible: ' + img.media_type + '.');
  if (img && img.data.length > 6.5e6) return fail(res, 413, 'imgsize', 'La foto supera el límite de 5 MB de la IA.');

  const content = [];
  if (img) content.push({type: 'image', source: {type: 'base64', media_type: img.media_type, data: img.data}});
  content.push({type: 'text', text: prompt(!!img, text)});

  let last = null;
  for (const model of MODELS) {
    let r;
    try { r = await callAnthropic(key, model, content); }
    catch (e) { last = {status: 502, error: 'network', message: 'El servidor no pudo contactar con Anthropic: ' + (e.message || 'error de red') + '.'}; continue; }

    if (r.ok) {
      const out = (r.j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      try {
        const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
        return send(res, 200, {ok: true, model, result: clean(parsed)});
      } catch (e) { last = {status: 502, error: 'parse', message: 'La IA devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.'}; continue; }
    }

    const msg = (r.j.error && r.j.error.message) || 'sin detalle';
    if (r.status === 401) return fail(res, 502, 'badkey', 'Anthropic rechazó la clave ANTHROPIC_API_KEY (401). Revisa que esté bien copiada.');
    if (r.status === 403) return fail(res, 502, 'forbidden', 'La clave de Anthropic no tiene permiso (403): ' + msg);
    if (r.status === 400 && /credit|balance|billing/i.test(msg)) return fail(res, 402, 'credits', 'Tu cuenta de Anthropic no tiene saldo: ' + msg);
    if (r.status === 400) return fail(res, 400, 'anthropic', 'Anthropic rechazó la petición: ' + msg);
    last = {status: r.status === 429 ? 429 : 502, error: r.status === 429 ? 'ratelimit' : 'anthropic', message: (r.status === 429 ? 'Límite de uso de Anthropic alcanzado. Espera un minuto. ' : 'Error de Anthropic (HTTP ' + r.status + '): ') + msg};
  }
  return fail(res, last.status, last.error, last.message);
};
