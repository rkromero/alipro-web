/* =========================================================================
   ALIPRO — Formulario de cotización compartido por todas las páginas

   Uso en cada página (la hoja de estilos del formulario ya vive en alipro.css):

     <div id="cotizar"
          data-origen="web-alipro"                       ← obligatorio: de qué landing viene el lead
          data-num="10"                                  ← número de la sección (cabecera)
          data-titulo="Contanos qué querés fabricar"     ← título de la sección
          data-producto="Alfajores"                      ← opcional: producto fijo de la landing.
                                                           Si falta, el primer campo es el select "¿Qué querés producir?"
          data-variantes="Chocolate negro|Maicena|Varias variantes=Varias"
                                                         ← variantes del producto fijo ("valor" o "valor=etiqueta")
          data-msj="¿Receta propia? ¿Relleno? ¿Para cuándo lo necesitás?"
                                                         ← opcional: placeholder del mensaje libre
     ></div>
     <script src="/cotizar.js" defer></script>

   Este archivo reemplaza el div por la sección completa (<section class="formsec" id="cotizar">)
   y cablea todo el comportamiento: 2 pasos, validación, scoring, regla de volumen,
   aviso de bobina, honeypot, envío al CRM, fallback por mail, medición y botón de WhatsApp.

   Regla de oro: medir nunca puede romper la página ni el envío del formulario.
   ========================================================================= */
(function () {
'use strict';

/* =========================================================================
   CONFIGURACIÓN — un solo lugar para todo el sitio
   ========================================================================= */
/* 1) CRM_ENDPOINT: URL del CRM que recibe el lead (POST con el JSON en el cuerpo).
   2) EMAIL_DESTINO y WHATSAPP: reemplazar por los reales antes de publicar.
   3) PAGINA_GRACIAS: URL limpia de gracias.html. Dejar vacío ("") si preferís el mensaje en la misma página. */
const CRM_ENDPOINT   = "https://mimibot-production-1c38.up.railway.app/api/leads/intake"; // CRM ALIPRO
const EMAIL_DESTINO  = "contacto@alipro.com.ar";  // fallback por mail si el endpoint falla
const WHATSAPP       = "5491100000000";           // formato internacional sin + ni espacios
const PAGINA_GRACIAS = "/gracias";                // objetivo de conversión para analytics

/* =========================================================================
   SCORING — cuánto suma cada respuesta. Máximo 14 puntos.
   A = 10 a 14  ·  B = 6 a 9  ·  C = 0 a 5
   Esta tabla vive SOLO acá y debe ser IDÉNTICA a la del CRM.
   ========================================================================= */
const SCORE = {
  cantidad: {"Más de 30.000 u./mes":4, "10.000 a 30.000 u./mes":3, "3.000 a 10.000 u./mes":2, "1.000 a 3.000 u./mes":1, "300 a 1.000 u./mes":0},
  plazo:    {"Ya, tengo todo listo":3, "En 1 a 3 meses":2, "En más de 3 meses":1, "Estoy explorando la idea":0},
  packaging:{"Bobina impresa con su marca":3, "Film cristal (sin impresión)":1},
  situacion:{"Tiene CUIT y marca registrada":2, "Tiene CUIT, marca en trámite o sin registrar":1, "Todavía no tiene CUIT":0},
  canal:    {"Retail y supermercados":2, "Distribución mayorista":2, "Gastronomía, cafetería u hotelería":1, "Local o tienda propia":1, "E-commerce":1, "Todavía no lo defino":0}
};
const gradeOf = s => s >= 10 ? "A" : (s >= 6 ? "B" : "C");   // máximo 14

/* ========================= configuración por página ========================= */
const esc = v => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function leerConfig(ph){
  const d = ph.dataset || {};
  const producto = (d.producto || '').trim();                 // producto fijo de la landing ("" = select genérico)
  const variantes = (d.variantes || '').split('|').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf('=');                                  // "valor=etiqueta" o solo "valor"
    return i < 0 ? {valor:s, etiqueta:s} : {valor:s.slice(0,i).trim(), etiqueta:s.slice(i+1).trim()};
  });
  return {
    origen:   d.origen || 'web-alipro',
    num:      d.num || '10',
    titulo:   d.titulo || 'Contanos qué querés fabricar',
    producto, variantes,
    msj:      d.msj || '¿Receta propia? ¿Tipo de envasado? ¿Para cuándo lo necesitás?'
  };
}

/* ========================= markup ========================= */
function campoProducto(cfg){
  if(!cfg.producto){
    return '<div class="fld"><label for="producto">¿Qué querés producir? *</label>\n' +
      '<select id="producto" name="producto" required>\n' +
      '<option value="Alfajores" selected>Alfajores</option>\n' +
      '<option value="Galletitas">Galletitas</option>\n' +
      '<option value="Piononos">Piononos</option>\n' +
      '<option value="Bizcochuelos">Bizcochuelos</option>\n' +
      '<option value="Merengues">Merengues</option>\n' +
      '<option value="Tapas / semielaborados">Tapas y semielaborados</option>\n' +
      '<option value="Otro producto">Otro producto</option>\n' +
      '</select></div>';
  }
  return '<div class="fld" data-req="variante"><label>¿Qué variante te interesa? *</label>\n' +
    '<div class="pills" role="radiogroup" aria-label="Variante de ' + esc(singular(cfg.producto)) + '">\n' +
    cfg.variantes.map(v => '<label><input type="radio" name="variante" value="' + esc(v.valor) + '"><span>' + esc(v.etiqueta) + '</span></label>').join('\n') + '\n' +
    '</div><div class="err">Elegí al menos una variante.</div></div>';
}

/* "Alfajores" → "alfajor" para el aria-label; el resto del texto usa el plural en minúscula */
function singular(p){ const s = p.toLowerCase(); return /[^aeiou]es$/.test(s) ? s.slice(0,-2) : (s.endsWith('s') ? s.slice(0,-1) : s); }
const plural = p => p.toLowerCase();

function markup(cfg){
  const envasar = cfg.producto ? 'tus ' + plural(cfg.producto) : 'tu producto';
  /* "Mirá la comparación": ancla a la sección #packaging si la página la tiene; si no, a la página /packaging */
  const packHref = document.getElementById('packaging') ? '#packaging' : '/packaging';
  return '<div class="wrap">\n' +
'<div class="fgrid">\n' +
'<div>\n' +
'<div class="shead"><span class="num">' + esc(cfg.num) + '</span><span class="kicker">Cotización</span></div>\n' +
'<h2 class="stitle">' + esc(cfg.titulo) + '</h2>\n' +
'<p class="slede">Menos de un minuto. Te respondemos dentro de las 72 hs hábiles, sin compromiso.</p>\n' +
'<div class="fdatos">\n' +
'<div><b>Email</b> · [contacto@alipro.com.ar]</div>\n' +
'<div><b>WhatsApp</b> · [+54 9 XXX XXX-XXXX]</div>\n' +
'<div><b>Planta</b> · [Ciudad, Provincia]</div>\n' +
'</div>\n' +
'</div>\n' +
'<form id="cotform" novalidate>\n' +
'<input type="hidden" name="segmento" id="segmento" value="">\n' +
'<div class="hp" aria-hidden="true"><label>Dejá este campo vacío<input type="text" name="empresa_web" tabindex="-1" autocomplete="off"></label></div>\n' +
'\n' +
'<div class="fprog" aria-hidden="true">\n' +
'<div class="st on" id="pi1"><b>1</b>Tu proyecto</div>\n' +
'<div class="bar"></div>\n' +
'<div class="st" id="pi2"><b>2</b>Tus datos</div>\n' +
'</div>\n' +
'\n' +
'<div class="fstep" id="paso1">\n' +
campoProducto(cfg) + '\n' +
'\n' +
'<div class="fld" data-req="cantidad"><label>¿Cuánto estimás producir por mes? *</label>\n' +
'<p class="moq">Desde <b>300 unidades</b> con flow pack cristal, o desde <b>1.000</b> con el resto de las presentaciones.</p>\n' +
'<div class="pills wide1" role="radiogroup" aria-label="Volumen estimado">\n' +
'<label><input type="radio" name="cantidad" value="300 a 1.000 u./mes"><span>300 a 1.000 u. — solo con film cristal</span></label>\n' +
'<label><input type="radio" name="cantidad" value="1.000 a 3.000 u./mes"><span>1.000 a 3.000 u.</span></label>\n' +
'<label><input type="radio" name="cantidad" value="3.000 a 10.000 u./mes"><span>3.000 a 10.000 u.</span></label>\n' +
'<label><input type="radio" name="cantidad" value="10.000 a 30.000 u./mes"><span>10.000 a 30.000 u.</span></label>\n' +
'<label><input type="radio" name="cantidad" value="Más de 30.000 u./mes"><span>Más de 30.000 u.</span></label>\n' +
'</div><div class="err">Elegí un volumen estimado: sin eso no podemos cotizarte.</div></div>\n' +
'\n' +
'<div class="notachico" id="notachico" hidden>Por debajo de 1.000 unidades producimos <b>solo con flow pack cristal</b>. El envase impreso con tu marca necesita una bobina propia, y para que tenga sentido conviene partir de 1.000 unidades. Podés arrancar con cristal y tu etiqueta, y pasar a la bobina cuando crezcas.</div>\n' +
'<div class="fld" data-req="packaging"><label>¿Cómo querés el packaging? *</label>\n' +
'<p class="packlink">¿No sabés cuál te conviene? <a href="' + packHref + '">Mirá la comparación</a>.</p>\n' +
'<div class="pills col1" role="radiogroup" aria-label="Tipo de packaging">\n' +
'<label><input type="radio" name="packaging" value="Film cristal (sin impresión)"><span>Film cristal — sin impresión, sin inversión inicial</span></label>\n' +
'<label><input type="radio" name="packaging" value="Bobina impresa con su marca"><span>Bobina impresa con mi marca</span></label>\n' +
'</div><div class="err">Elegí cómo querés envasar ' + esc(envasar) + '.</div></div>\n' +
'\n' +
'<div class="avisobob" id="avisobob" hidden>\n' +
'<b>Antes de seguir, esto es importante</b>\n' +
'<p>La bobina impresa tiene un <b>mínimo de 300 kg</b> —150 kg por cada uno de dos diseños—, porque es lo mínimo que imprime una flexográfica. Esos 300 kg rinden <b>unos 100.000 alfajores</b>, quedan guardados en nuestra planta y los vamos usando en cada producción que nos pidas.</p>\n' +
'<!-- MONTO BOBINA: si cambia, actualizar acá, en packaging.html (tarjeta "Opción B" y nota), en preguntas-frecuentes.html (respuesta sobre marca impresa y su JSON-LD) y en fason/alfajores.html -->\n' +
'<p class="montobob">Inversión inicial aproximada: <b>$3.000.000</b> por única vez — unos <b>$30 por alfajor</b> sobre las primeras 100.000 unidades.<span class="ref">Valores de referencia a julio 2026. Te confirmamos el importe vigente junto con la cotización.</span></p>\n' +
'<label class="chk"><input type="checkbox" name="acepta_bobina" id="acepta_bobina"><span>Entiendo que el packaging con mi marca requiere una inversión inicial de aproximadamente <b>$3.000.000</b> en bobina</span></label>\n' +
'<div class="err">Confirmá que entendés la inversión inicial, o elegí film cristal.</div>\n' +
'</div>\n' +
'\n' +
'<div class="fld" data-req="plazo"><label>¿Cuándo querés empezar a producir? *</label>\n' +
'<div class="pills" role="radiogroup" aria-label="Plazo estimado">\n' +
'<label><input type="radio" name="plazo" value="Ya, tengo todo listo"><span>Ya, tengo todo listo</span></label>\n' +
'<label><input type="radio" name="plazo" value="En 1 a 3 meses"><span>En 1 a 3 meses</span></label>\n' +
'<label><input type="radio" name="plazo" value="En más de 3 meses"><span>En más de 3 meses</span></label>\n' +
'<label><input type="radio" name="plazo" value="Estoy explorando la idea"><span>Estoy explorando</span></label>\n' +
'</div><div class="err">Contanos en qué plazo querés arrancar.</div></div>\n' +
'\n' +
'<div class="fld"><label for="canal">¿Dónde vas a vender? *</label>\n' +
'<select id="canal" name="canal" required>\n' +
'<option value="" disabled selected>Elegí una opción</option>\n' +
'<option>Retail y supermercados</option>\n' +
'<option>Distribución mayorista</option>\n' +
'<option>Local o tienda propia</option>\n' +
'<option>Gastronomía, cafetería u hotelería</option>\n' +
'<option>E-commerce</option>\n' +
'<option>Todavía no lo defino</option>\n' +
'</select><div class="err">Elegí tu canal de venta.</div></div>\n' +
'\n' +
'<button class="btn fsubmit" type="button" id="next1">Continuar →</button>\n' +
'<div class="fnote">Paso 1 de 2 · Todavía no te pedimos datos personales.</div>\n' +
'</div>\n' +
'\n' +
'<div class="fstep" id="paso2" hidden>\n' +
'<div class="frow2">\n' +
'<div class="fld"><label for="nombre">Tu nombre *</label><input type="text" id="nombre" name="nombre" required autocomplete="name" placeholder="Nombre y apellido"><div class="err">Decinos cómo te llamás.</div></div>\n' +
'<div class="fld"><label for="empresa">Empresa o marca *</label><input type="text" id="empresa" name="empresa" required autocomplete="organization" placeholder="Razón social o nombre de marca"><div class="err">Poné tu empresa o la marca del proyecto.</div></div>\n' +
'</div>\n' +
'<div class="frow2">\n' +
'<div class="fld"><label for="wa">WhatsApp *</label><input type="tel" id="wa" name="wa" required autocomplete="tel" inputmode="tel" placeholder="11 5555-5555"><div class="err">Ingresá un WhatsApp válido con característica.</div></div>\n' +
'<div class="fld"><label for="email">Email *</label><input type="email" id="email" name="email" required autocomplete="email" inputmode="email" placeholder="tu@empresa.com"><div class="err">Ingresá un email válido.</div></div>\n' +
'</div>\n' +
'<div class="fld"><label for="provincia">¿Desde qué provincia? *</label>\n' +
'<select id="provincia" name="provincia" required>\n' +
'<option value="" disabled selected>Elegí tu provincia</option>\n' +
'<option>Buenos Aires</option><option>CABA</option><option>Catamarca</option><option>Chaco</option><option>Chubut</option><option>Córdoba</option><option>Corrientes</option><option>Entre Ríos</option><option>Formosa</option><option>Jujuy</option><option>La Pampa</option><option>La Rioja</option><option>Mendoza</option><option>Misiones</option><option>Neuquén</option><option>Río Negro</option><option>Salta</option><option>San Juan</option><option>San Luis</option><option>Santa Cruz</option><option>Santa Fe</option><option>Santiago del Estero</option><option>Tierra del Fuego</option><option>Tucumán</option><option>Fuera de Argentina</option>\n' +
'</select><div class="err">Elegí tu provincia: define el flete y los plazos.</div></div>\n' +
'<div class="fld" data-req="situacion"><label>¿En qué situación está tu proyecto? *</label>\n' +
'<div class="pills col1" role="radiogroup" aria-label="Situación del proyecto">\n' +
'<label><input type="radio" name="situacion" value="Tiene CUIT y marca registrada"><span>Tengo CUIT y marca registrada</span></label>\n' +
'<label><input type="radio" name="situacion" value="Tiene CUIT, marca en trámite o sin registrar"><span>Tengo CUIT, marca en trámite o sin registrar</span></label>\n' +
'<label><input type="radio" name="situacion" value="Todavía no tiene CUIT"><span>Todavía no tengo CUIT</span></label>\n' +
'</div><div class="err">Elegí una opción.</div></div>\n' +
'<div class="fld"><label for="msj">Contanos algo más <span class="opt">(opcional)</span></label><textarea id="msj" name="msj" placeholder="' + esc(cfg.msj) + '"></textarea></div>\n' +
'<div class="fnav">\n' +
'<button class="btn back" type="button" id="back2">← Volver</button>\n' +
'<button class="btn fsubmit" type="submit" style="flex:1">Pedir cotización →</button>\n' +
'</div>\n' +
'<div class="fnote">Tus datos se usan solo para responder tu consulta. Firmamos NDA antes de conocer cualquier receta.</div>\n' +
'</div>\n' +
'<div class="fok" id="fok">¡Listo! Recibimos tu consulta y te respondemos dentro de las 72 hs hábiles.</div>\n' +
'</form>\n' +
'</div>\n' +
'</div>';
}

/* ========================= comportamiento ========================= */
function comportamiento(sec, cfg){
  const ORIGEN = cfg.origen;
  const fijo   = !!cfg.producto;           // landing de un producto (variantes) o formulario genérico (select)

  /* ========================= utilidades ========================= */
  const f    = document.getElementById('cotform');
  const paso1= document.getElementById('paso1');
  const paso2= document.getElementById('paso2');
  const okBox= document.getElementById('fok');
  const digits = v => (v||'').replace(/\D/g,'');
  const esTel  = v => { const d = digits(v); return d.length >= 10 && d.length <= 13; };
  const esMail = v => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test((v||'').trim());
  const marcado = n => { const el = f.querySelector('[name="'+n+'"]:checked'); return el ? el.value : ''; };
  const campo = el => el.closest('.fld');
  const fallar = (el, mal) => { const c = campo(el); if(c) c.classList.toggle('bad', !!mal); return !mal; };
  const aviso = document.getElementById('avisobob');
  /* qué producto se cotiza: el select genérico o el producto fijo + la variante elegida */
  const productoElegido = () => fijo ? cfg.producto + ' — ' + marcado('variante') : f.producto.value;

  /* mostrar el aviso de la bobina solo si eligió packaging impreso */
  f.addEventListener('change', e => {
    if(e.target.name !== 'packaging') return;
    const impreso = e.target.value === 'Bobina impresa con su marca';
    aviso.hidden = !impreso;
    if(!impreso){ f.acepta_bobina.checked = false; aviso.classList.remove('bad'); }
  });
  document.getElementById('acepta_bobina').addEventListener('change', () => aviso.classList.remove('bad'));

  /* regla comercial: por debajo de 1.000 u. solo se puede producir con film cristal */
  const notaChico  = document.getElementById('notachico');
  const optBobina  = f.querySelector('[name=packaging][value="Bobina impresa con su marca"]');
  const wrapBobina = optBobina.closest('label');
  function aplicarReglaVolumen(){
    const chico = marcado('cantidad') === '300 a 1.000 u./mes';
    optBobina.disabled = chico;
    wrapBobina.classList.toggle('off', chico);
    notaChico.hidden = !chico;
    if(chico && optBobina.checked){
      optBobina.checked = false;
      aviso.hidden = true;
      f.acepta_bobina.checked = false;
      aviso.classList.remove('bad');
    }
  }
  f.addEventListener('change', e => { if(e.target.name === 'cantidad') aplicarReglaVolumen(); });
  aplicarReglaVolumen();

  function validar(paso){
    let ok = true, primero = null;
    const marcar = (el, mal) => { if(mal && !primero) primero = campo(el); ok = fallar(el, mal) && ok; };
    if(paso === 1){
      if(fijo) marcar(f.querySelector('[name=variante]'), !marcado('variante'));
      else     marcar(f.producto, !f.producto.value);
      marcar(f.querySelector('[name=cantidad]'),  !marcado('cantidad'));
      marcar(f.querySelector('[name=packaging]'), !marcado('packaging'));
      marcar(f.querySelector('[name=plazo]'),     !marcado('plazo'));
      marcar(f.canal, !f.canal.value);
      // si eligió bobina impresa, tiene que confirmar que entiende la inversión
      const faltaOK = marcado('packaging') === 'Bobina impresa con su marca' && !f.acepta_bobina.checked;
      aviso.classList.toggle('bad', faltaOK);
      if(faltaOK){ ok = false; if(!primero) primero = aviso; }
    } else {
      marcar(f.nombre,    f.nombre.value.trim().length < 2);
      marcar(f.empresa,   f.empresa.value.trim().length < 2);
      marcar(f.wa,        !esTel(f.wa.value));
      marcar(f.email,     !esMail(f.email.value));
      marcar(f.provincia, !f.provincia.value);
      marcar(f.querySelector('[name=situacion]'), !marcado('situacion'));
    }
    if(primero) primero.scrollIntoView({behavior:'smooth', block:'center'});
    return ok;
  }

  // limpiar el error apenas el usuario corrige
  f.addEventListener('input',  e => { const c = campo(e.target); if(c) c.classList.remove('bad'); });
  f.addEventListener('change', e => { const c = campo(e.target); if(c) c.classList.remove('bad'); });

  /* ========================= navegación entre pasos ========================= */
  function irA(n){
    paso1.hidden = n !== 1;
    paso2.hidden = n !== 2;
    document.getElementById('pi1').classList.toggle('on', true);
    document.getElementById('pi2').classList.toggle('on', n === 2);
    sec.scrollIntoView({behavior:'smooth', block:'start'});
  }
  document.getElementById('next1').addEventListener('click', () => { if(validar(1)) irA(2); });
  document.getElementById('back2').addEventListener('click', () => irA(1));

  /* ========================= segmento (A/B/C/D y ?seg=) ========================= */
  const hidSeg = document.getElementById('segmento');
  try{
    const segURL = new URLSearchParams(location.search).get('seg');
    if(segURL) hidSeg.value = segURL;
    document.querySelectorAll('[data-seg]').forEach(a => {
      a.addEventListener('click', () => { hidSeg.value = a.dataset.seg; });
    });
  }catch(e){ /* sin segmento no pasa nada: el lead sale igual */ }

  /* ========================= botones flotantes ========================= */
  /* El markup de la botonera (.floatstack con #wabtn y #cotpill) vive en cada página. */
  try{
    const cotpill = document.getElementById('cotpill');
    const floats  = document.querySelector('.floatstack');
    const heroSec = document.querySelector('.hero');
    if('IntersectionObserver' in window){
      // el CTA "Cotizar" sobra cuando el formulario ya está a la vista
      if(cotpill) new IntersectionObserver(es => {
        es.forEach(en => { cotpill.style.display = en.isIntersecting ? 'none' : ''; });
      }, {threshold: .12}).observe(sec);
      // en pantallas chicas la botonera tapa los CTA del hero: la escondemos mientras el hero se ve
      if(floats && heroSec) new IntersectionObserver(es => {
        es.forEach(en => { floats.classList.toggle('oculto', en.isIntersecting); });
      }, {threshold: .35}).observe(heroSec);
    }
  }catch(e){ /* la botonera es accesoria */ }

  const wabtn = document.getElementById('wabtn');
  function armarWA(){
    if(!wabtn) return;
    const cant = marcado('cantidad');
    let t;
    if(fijo){
      t = 'Hola ALIPRO, quiero cotizar producción de ' + plural(cfg.producto) + ' a fason.';
      t += '\nVariante: ' + (marcado('variante') || '');
    } else {
      const prod = f.producto.value || '';
      t = 'Hola ALIPRO, quiero cotizar producción a fason.';
      if(prod) t += '\nProducto: ' + prod;
    }
    t += '\nVolumen mensual estimado: ' + (cant || '');
    wabtn.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(t);
  }
  armarWA();
  f.addEventListener('change', armarWA);

  /* ========================= conversión ========================= */
  /* Un solo lugar donde avisar a las herramientas de medición. Si mañana
     sumás Google Ads o Meta, se toca acá y en ningún otro lado. */
  function avisarAnalytics(data){
    try{
      if(typeof gtag === 'function'){
        gtag('event','generate_lead',{
          lead_grade:data.lead_grade, lead_score:data.lead_score,
          producto:data.producto, volumen:data.cantidad,
          value:data.lead_score, currency:'ARS'
        });
      }
      if(window.dataLayer){
        window.dataLayer.push({event:'lead_enviado', lead_grade:data.lead_grade,
          lead_score:data.lead_score, producto:data.producto, volumen:data.cantidad});
      }
      /* Meta: el mismo evento Lead sale por el navegador (Píxel) y por el
         servidor (API de Conversiones) con un event_id compartido, así Meta lo
         deduplica. Los datos personales viajan a /api/capi, que los hashea con
         SHA-256 antes de mandarlos: nunca salen en claro hacia Meta.
         Si meta.js no cargó (adblocker), metaEvento no existe y seguimos igual. */
      if(typeof window.metaEvento === 'function'){
        window.metaEvento('Lead', {
          content_name: data.producto,
          content_category: data.lead_grade,
          value: data.lead_score, currency: 'ARS',
          volumen: data.cantidad, packaging: data.packaging, plazo: data.plazo
        }, {
          email: data.email, whatsapp: data.whatsapp,
          nombre: data.nombre, provincia: data.provincia
        });
      }
    }catch(e){ /* medir nunca puede romper el envío */ }
  }

  function exito(data){
    avisarAnalytics(data);
    f.reset();
    if(PAGINA_GRACIAS){
      /* 400 ms de aire para que el Píxel y la API de Conversiones alcancen a
         salir antes de que el navegador abandone la página. */
      setTimeout(function(){
        location.href = PAGINA_GRACIAS + '?g=' + encodeURIComponent(data.lead_grade || '');
      }, 400);
      return;
    }
    paso2.hidden = true;
    okBox.style.display = 'block';
  }

  /* ========================= envío ========================= */
  f.addEventListener('submit', async function(e){
    e.preventDefault();
    if(f.empresa_web.value){ okBox.style.display='block'; return; }   // honeypot: bot
    if(!validar(2)) return;

    const variante = fijo ? marcado('variante') : '';
    const cantidad = marcado('cantidad'), plazo = marcado('plazo'), situacion = marcado('situacion');
    const packaging = marcado('packaging'), canal = f.canal.value;
    const score = (SCORE.cantidad[cantidad]||0) + (SCORE.plazo[plazo]||0) + (SCORE.packaging[packaging]||0)
                + (SCORE.situacion[situacion]||0) + (SCORE.canal[canal]||0);

    const data = {
      lead_grade: gradeOf(score), lead_score: score,
      nombre: f.nombre.value.trim(), empresa: f.empresa.value.trim(),
      whatsapp: f.wa.value.trim(), email: f.email.value.trim(),
      provincia: f.provincia.value, producto: productoElegido(),
      cantidad, plazo, canal, situacion, packaging,
      acepta_inversion_bobina: f.acepta_bobina.checked ? 'Sí' : 'No corresponde',
      segmento: hidSeg.value || 'Sin segmento',
      mensaje: f.msj.value.trim(), origen: ORIGEN,
      pagina: location.pathname, fecha: new Date().toISOString()
    };

    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Enviando…';

    if(CRM_ENDPOINT){
      try{
        /* text/plain A PROPÓSITO — NO CAMBIAR: con application/json el navegador
           dispara un preflight CORS (OPTIONS) que el endpoint no contesta y el envío
           falla siempre. Con text/plain el pedido es "simple", no hay preflight, y el
           servidor recibe igual el JSON completo en el cuerpo. */
        const r = await fetch(CRM_ENDPOINT, {
          method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify(data)
        });
        if(r.ok){ exito(data); return; }
        throw new Error('HTTP ' + r.status);
      }catch(err){ /* si falla, cae al mailto de abajo: nunca se pierde un lead */ }
    }
    avisarAnalytics(data);
    const cuerpo = encodeURIComponent(
      (fijo ? 'Nueva consulta desde la landing de ' + plural(cfg.producto) + '\n' : 'Nueva consulta desde la web ALIPRO\n') +
      '\n[' + data.lead_grade + '] Puntaje de calificación: ' + score + '/10' +
      '\n\nNombre: ' + data.nombre + '\nEmpresa/marca: ' + data.empresa +
      '\nWhatsApp: ' + data.whatsapp + '\nEmail: ' + data.email + '\nProvincia: ' + data.provincia +
      '\n\nProducto: ' + data.producto + '\nVolumen mensual: ' + cantidad +
      '\nPackaging: ' + packaging +
      '\nAcepta la inversión en bobina: ' + data.acepta_inversion_bobina +
      '\nPlazo: ' + plazo + '\nCanal de venta: ' + canal + '\nSituación: ' + situacion +
      '\nSegmento: ' + data.segmento +
      '\n\nMensaje: ' + (data.mensaje || '—')
    );
    const asunto = encodeURIComponent('[' + data.lead_grade + '] Cotización ' +
      (fijo ? plural(cfg.producto) + ' — ' + variante : 'web — ' + data.producto) + ' — ' + data.empresa);
    window.location.href = 'mailto:' + EMAIL_DESTINO + '?subject=' + asunto + '&body=' + cuerpo;
    btn.disabled = false; btn.textContent = 'Pedir cotización →';
  });
}

/* ========================= arranque ========================= */
function init(){
  const ph = document.getElementById('cotizar');
  if(!ph || document.getElementById('cotform')) return;      // no hay placeholder, o ya se inyectó
  const cfg = leerConfig(ph);
  const sec = document.createElement('section');
  sec.className = 'formsec';
  sec.id = 'cotizar';
  sec.innerHTML = markup(cfg);
  ph.parentNode.replaceChild(sec, ph);
  comportamiento(sec, cfg);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
