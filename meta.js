/* =========================================================================
   ALIPRO — Píxel de Meta + API de Conversiones
   Conjunto de datos (dataset): 1397588482338338  ·  Administrador de eventos → "Alipro"

   Qué hace este archivo:
     1) Carga el código base del Píxel y dispara PageView.
     2) Expone window.metaEvento(nombre, datos, persona) para el resto del sitio.
     3) Manda el MISMO evento al servidor (/api/capi) con el MISMO event_id,
        para que Meta los deduplique y no cuente la conversión dos veces.
     4) Cablea solo dos eventos automáticos: ViewContent (sección "Primer Lote")
        y Contact (clic en cualquier botón de WhatsApp).

   Regla de oro: medir nunca puede romper la página ni el envío del formulario.
   Por eso absolutamente todo va dentro de try/catch.
   ========================================================================= */
(function () {
  'use strict';

  var PIXEL_ID = '1397588482338338';
  var CAPI_URL = '/api/capi';

  /* ---------------- 1) Código base del Píxel (snippet oficial de Meta) ---- */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  try { fbq('init', PIXEL_ID); } catch (e) {}

  /* ---------------- 2) Un id único por evento (clave de la deduplicación) - */
  function nuevoId() {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) {}
    return 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  }

  /* ---------------- 3) Copia del evento hacia nuestro propio servidor ----- */
  /* El navegador manda el evento a /api/capi (mismo dominio: sin CORS, sin
     bloqueo de adblockers) y desde ahí sale hacia Meta con la IP real, el
     user agent y las cookies _fbp/_fbc que lee el propio servidor.
     keepalive:true hace que el pedido sobreviva al cambio de página. */
  function alServidor(nombre, eventId, datos, persona) {
    try {
      var cuerpo = JSON.stringify({
        event_name: nombre,
        event_id: eventId,
        event_source_url: location.href,
        action_source: 'website',
        custom_data: datos || {},
        user_data: persona || {}
      });
      if (window.fetch) {
        fetch(CAPI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cuerpo,
          keepalive: true,
          credentials: 'same-origin'
        }).catch(function () {});
      } else if (navigator.sendBeacon) {
        navigator.sendBeacon(CAPI_URL, new Blob([cuerpo], { type: 'application/json' }));
      }
    } catch (e) {}
  }

  /* ---------------- 4) La función que usa el resto del sitio -------------- */
  /* nombre  : 'Lead', 'ViewContent', 'Contact', 'PageView'…
     datos   : parámetros del evento (content_name, value, currency…)
     persona : datos personales SIN hashear (email, teléfono, nombre…).
               Van a nuestro servidor, que los hashea con SHA-256 antes de
               mandarlos a Meta. Nunca salen en claro hacia Meta. */
  window.metaEvento = function (nombre, datos, persona) {
    var id = nuevoId();
    try {
      if (typeof fbq === 'function') fbq('track', nombre, datos || {}, { eventID: id });
    } catch (e) {}
    alServidor(nombre, id, datos, persona);
    return id;
  };

  /* ---------------- 5) PageView en las dos puntas ------------------------- */
  try {
    var idPV = nuevoId();
    fbq('track', 'PageView', {}, { eventID: idPV });
    alServidor('PageView', idPV, {}, {});
  } catch (e) {}

  /* ---------------- 6 y 7) Eventos que necesitan el DOM armado ------------ */
  /* El Píxel se carga en el <head> para que PageView salga lo antes posible,
     así que estas dos partes esperan a que el body exista. */
  function alCargarElDOM() {
    /* ---------------- 6) ViewContent: llegaron a "Primer Lote" -------------- */
    /* No es un scroll cualquiera: #primerlote es la oferta de entrada. Que la
       vean media pantalla arriba es la señal más temprana de interés real. */
    try {
      var lote = document.getElementById('primerlote');
      if (lote && 'IntersectionObserver' in window) {
        var visto = false;
        new IntersectionObserver(function (entradas, obs) {
          entradas.forEach(function (en) {
            if (en.isIntersecting && !visto) {
              visto = true;
              window.metaEvento('ViewContent', {
                content_name: 'Primer Lote',
                content_category: 'oferta-de-entrada'
              });
              obs.disconnect();
            }
          });
        }, { threshold: 0.5 }).observe(lote);
      }
    } catch (e) {}

    /* ---------------- 7) Contact: clic en WhatsApp -------------------------- */
    /* Delegado en document, así también cuenta el botón flotante cuyo href se
       arma dinámicamente después de cargar la página. */
    try {
      document.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href*="wa.me"]') : null;
        if (!a) return;
        window.metaEvento('Contact', {
          content_name: 'WhatsApp',
          content_category: document.title
        });
      }, true);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alCargarElDOM);
  } else {
    alCargarElDOM();
  }
})();
