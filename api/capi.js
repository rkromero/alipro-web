/* =========================================================================
   ALIPRO — API de Conversiones de Meta (función serverless de Vercel)

   Ruta pública: POST https://<tu-dominio>/api/capi
   Conjunto de datos: 1397588482338338

   El navegador manda acá el mismo evento que ya disparó el Píxel, con el
   mismo event_id. Este archivo agrega lo que el navegador no puede dar de
   forma confiable (IP real, user agent, cookies _fbp/_fbc), hashea los datos
   personales con SHA-256 y recién ahí lo manda a Meta.

   Variables de entorno a cargar en Vercel (Settings → Environment Variables):
     META_CAPI_TOKEN        (obligatoria) token de acceso del conjunto de datos
     META_PIXEL_ID          (opcional)    por defecto 1397588482338338
     META_TEST_EVENT_CODE   (opcional)    solo mientras probás en "Eventos de prueba"
     META_API_VERSION       (opcional)    por defecto v24.0

   Importante: el token NO va en el código ni en el repositorio. Solo en Vercel.
   ========================================================================= */

const crypto = require('crypto');

const PIXEL_ID    = process.env.META_PIXEL_ID || '1397588482338338';
const TOKEN       = process.env.META_CAPI_TOKEN || '';
const TEST_CODE   = process.env.META_TEST_EVENT_CODE || '';
const API_VERSION = process.env.META_API_VERSION || 'v24.0';

/* ----------------------------- utilidades ------------------------------ */

const sha256 = (v) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

/* Meta exige minúsculas y sin espacios antes de hashear. */
function hashTexto(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  return t ? sha256(t) : null;
}

function hashEmail(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  return t.includes('@') ? sha256(t) : null;
}

/* Teléfono argentino → dígitos con código de país, como lo quiere Meta.
   Entra "011 15 4444-5555" o "+54 9 11 4444 5555" y sale "5491144445555". */
function quitarQuince(n) {
  /* El 15 va entre el código de área y el número. Si sacándolo quedan los
     10 dígitos de un celular argentino, era un 15. */
  if (n.length !== 12) return n;
  for (let i = 2; i <= 4; i++) {
    if (n.substr(i, 2) === '15') return n.slice(0, i) + n.slice(i + 2);
  }
  return n;
}

function normalizarTelefono(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    let resto = d.slice(2);
    if (resto.startsWith('9')) resto = resto.slice(1);
    resto = quitarQuince(resto);
    return resto.length >= 10 ? '549' + resto : null;
  }
  if (d.startsWith('0')) d = d.slice(1);
  d = quitarQuince(d);
  if (d.length === 10) return '549' + d;      // celular argentino sin código de país
  if (d.length >= 11) return d;               // ya trae código de país de otro país
  return null;                                 // incompleto: mejor no mandar basura
}

function hashTelefono(v) {
  const n = normalizarTelefono(v);
  return n ? sha256(n) : null;
}

/* Provincia: en minúsculas y sin acentos. */
function hashProvincia(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t ? sha256(t) : null;
}

/* El nombre suele venir entero en un solo campo: lo partimos. */
function partirNombre(nombre) {
  const partes = String(nombre == null ? '' : nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return [null, null];
  if (partes.length === 1) return [partes[0], null];
  return [partes[0], partes.slice(1).join(' ')];
}

function leerCookies(req) {
  const salida = {};
  const crudo = req.headers.cookie || '';
  crudo.split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return salida;
}

/* Si no existe la cookie _fbc pero la URL trae fbclid, armamos el _fbc a mano
   con el formato que pide Meta: fb.1.<timestamp>.<fbclid> */
function armarFbc(cookies, url) {
  if (cookies._fbc) return cookies._fbc;
  try {
    const fbclid = new URL(url).searchParams.get('fbclid');
    if (fbclid) return 'fb.1.' + Date.now() + '.' + fbclid;
  } catch (e) {}
  return null;
}

/* Cookies _fbp/_fbc de primera parte, puestas por NUESTRO servidor.
   Si un bloqueador impide que cargue fbevents.js, el navegador nunca crea
   estas cookies y la API de Conversiones se queda sin el identificador que
   más pesa en la calidad de coincidencias. Acá las creamos nosotros: mismo
   formato que usa Meta, y cuando el Píxel sí carga las reutiliza tal cual. */
function galleta(nombre, valor, host) {
  const dominio = String(host || '').split(':')[0].replace(/^www\./, '');
  const partes = [
    nombre + '=' + valor,
    'Max-Age=7776000',            // 90 días, igual que el Píxel
    'Path=/',
    'SameSite=Lax',
    'Secure'
  ];
  if (dominio && dominio.indexOf('.') > 0) partes.push('Domain=.' + dominio);
  return partes.join('; ');
}

function nuevoFbp() {
  return 'fb.1.' + Date.now() + '.' + Math.floor(1e9 + Math.random() * 9e9);
}

function ipDelCliente(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || null;
}

/* --------------------------- la función ------------------------------- */

module.exports = async function handler(req, res) {
  /* Chequeo rápido de salud: abrir /api/capi en el navegador dice si la
     función está desplegada y si el token está cargado, sin revelarlo. */
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      dataset: PIXEL_ID,
      api_version: API_VERSION,
      token_cargado: Boolean(TOKEN),
      modo_prueba: Boolean(TEST_CODE)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'metodo_no_permitido' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const nombreEvento = body.event_name;
    if (!nombreEvento) return res.status(400).json({ ok: false, error: 'falta_event_name' });

    if (!TOKEN) {
      /* Sin token no hay nada que mandar, pero devolvemos 200 igual:
         el navegador no tiene que enterarse ni romper el formulario. */
      return res.status(200).json({ ok: false, error: 'falta_META_CAPI_TOKEN' });
    }

    const cookies = leerCookies(req);
    const url = body.event_source_url || req.headers.referer || '';
    const p = body.user_data || {};
    const [nombre, apellido] = partirNombre(p.nombre || p.fn);

    /* Si el navegador no tiene _fbp o _fbc, las creamos y se las devolvemos
       en la respuesta, así el resto de la sesión ya viaja identificada. */
    const aSetear = [];
    let fbp = cookies._fbp;
    if (!fbp) { fbp = nuevoFbp(); aSetear.push(galleta('_fbp', fbp, req.headers.host)); }

    let fbc = armarFbc(cookies, url);
    if (fbc && !cookies._fbc) aSetear.push(galleta('_fbc', fbc, req.headers.host));

    if (aSetear.length) res.setHeader('Set-Cookie', aSetear);

    const user_data = {
      client_ip_address: ipDelCliente(req),
      client_user_agent: req.headers['user-agent'] || null,
      fbp: fbp,
      fbc: fbc,
      em: hashEmail(p.email),
      ph: hashTelefono(p.whatsapp || p.telefono),
      fn: hashTexto(nombre),
      ln: hashTexto(apellido),
      st: hashProvincia(p.provincia),
      country: hashTexto(p.country || 'ar')
    };
    Object.keys(user_data).forEach((k) => { if (!user_data[k]) delete user_data[k]; });

    const evento = {
      event_name: nombreEvento,
      event_time: Math.floor(Date.now() / 1000),
      event_id: body.event_id || undefined,
      event_source_url: url || undefined,
      action_source: body.action_source || 'website',
      user_data,
      custom_data: body.custom_data || {}
    };

    const carga = { data: [evento] };
    if (TEST_CODE) carga.test_event_code = TEST_CODE;

    const destino = 'https://graph.facebook.com/' + API_VERSION + '/' + PIXEL_ID +
                    '/events?access_token=' + encodeURIComponent(TOKEN);

    const r = await fetch(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(carga)
    });
    const respuesta = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('CAPI respondió con error:', JSON.stringify(respuesta));
      return res.status(200).json({ ok: false, error: 'meta_rechazo', detalle: respuesta.error || null });
    }

    return res.status(200).json({ ok: true, recibidos: respuesta.events_received || 0 });
  } catch (err) {
    console.error('CAPI falló:', err && err.message);
    /* 200 a propósito: un fallo de medición no puede propagarse al usuario. */
    return res.status(200).json({ ok: false, error: 'excepcion' });
  }
};
