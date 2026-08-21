/* =========================================================================
   ALIPRO — Encabezado y pie compartidos por todas las páginas

   Uso en cada página:
     <div id="nav"></div>      ← se reemplaza por el <nav> con el menú del sitio
     ...
     <div id="pie"></div>      ← se reemplaza por el <footer>
     <script src="/nav.js" defer></script>

   Para sumar una página al menú: poner activo:true en su línea de PAGINAS (o agregar la línea).
   Nada más. El menú y el pie solo muestran las páginas con activo:true; lo demás no se
   renderiza, así nunca hay un enlace que dé 404.

   Accesibilidad: todo navegable con teclado. El desplegable abre con Enter/Espacio/Flecha abajo,
   cierra con Escape (y devuelve el foco al botón), avisa con aria-expanded y también abre con
   un toque o clic (patrón "disclosure": no depende del hover). En móvil el menú vive detrás de un botón ☰.
   La página actual se marca comparando location.pathname con la URL de cada elemento.
   ========================================================================= */
(function () {
'use strict';

/* =========================================================================
   PÁGINAS DEL SITIO — una línea por página, en el orden del menú
   activo: true  → la página existe y se muestra en menú y pie
   activo: false → todavía no existe: no se renderiza (ni en el menú ni en el pie)
   hijos         → desplegable "Producción a fasón" (se muestra si el padre o algún hijo está activo)
   boton: true   → se dibuja como botón rojo
   ancla         → mientras la página no exista, el elemento apunta a esa ancla si la página actual la tiene
   ========================================================================= */
const PAGINAS = [
  { nombre: 'Inicio',                 url: '/',                         activo: true },
  { nombre: 'Producción a fasón',     url: '/fason',                    activo: true,  hijos: [
    { nombre: 'Alfajores',              url: '/fason/alfajores',              activo: true },
    { nombre: 'Galletitas',             url: '/fason/galletitas',             activo: false },
    { nombre: 'Piononos',               url: '/fason/piononos',               activo: false },
    { nombre: 'Bizcochuelos',           url: '/fason/bizcochuelos',           activo: false },
    { nombre: 'Tapas y semielaborados', url: '/fason/tapas-y-semielaborados', activo: false },
  ] },
  { nombre: 'Primer Lote',            url: '/primer-lote',              activo: false },
  { nombre: 'Packaging',              url: '/packaging',                activo: false },
  { nombre: 'La planta',              url: '/planta-y-habilitaciones',  activo: false },
  { nombre: 'Preguntas',              url: '/preguntas-frecuentes',     activo: false },
  { nombre: 'Cotizar',                url: '/cotizar',                  activo: false, boton: true, ancla: '#cotizar' },
];

/* Enlaces que solo van en el pie (misma regla: activo:false = no se muestra) */
const PIE_EXTRA = [
  { nombre: 'Política de privacidad', url: '/politica-de-privacidad', activo: false },
];

const EMAIL  = 'contacto@alipro.com.ar';
const LEMA   = 'Fábrica argentina de fason de alfajores, galletitas y producción para terceros. Fabricamos el crecimiento de tu marca.';
const LEGAL  = '© 2026 ALIPRO. Todos los derechos reservados. · RODOLFO ROMERO E HIJOS SRL · CUIT 3071751336 · RNE y RNPA habilitados';

/* Isologotipo ALIPRO (mismo trazado que usaban las páginas); color por parámetro */
const LOGO_PATHS = '<path d="M208 -151V-304H726V-151ZM594 -750 940 0H739L442 -671H500L204 0H2L349 -750Z"/><path d="M1245.0 -750V-84L1160.0 -167H1722.0V0H1056.0V-750Z"/><path d="M1853.0 -750H2042.0V0H1853.0Z"/><path d="M2643.0 -750Q2735.0 -750 2801.5 -718.5Q2868.0 -687 2903.5 -630.0Q2939.0 -573 2939.0 -497Q2939.0 -421 2903.5 -364.0Q2868.0 -307 2801.5 -275.5Q2735.0 -244 2643.0 -244H2315.0V-397H2633.0Q2687.0 -397 2718.0 -423.5Q2749.0 -450 2749.0 -497Q2749.0 -544 2718.0 -570.5Q2687.0 -597 2633.0 -597H2332.0L2417.0 -685V0H2228.0V-750Z"/><path d="M3204.0 -420H3485.0Q3538.0 -420 3569.0 -444.5Q3600.0 -469 3600.0 -513Q3600.0 -557 3569.0 -581.5Q3538.0 -606 3485.0 -606H3177.0L3262.0 -699V0H3073.0V-750H3510.0Q3594.0 -750 3657.0 -720.0Q3720.0 -690 3755.0 -637.0Q3790.0 -584 3790.0 -513Q3790.0 -443 3755.0 -390.0Q3720.0 -337 3657.0 -307.0Q3594.0 -277 3510.0 -277H3204.0ZM3325.0 -351H3538.0L3814.0 0H3595.0Z"/><path d="M4360.0 16Q4228.0 16 4128.5 -33.0Q4029.0 -82 3974.0 -170.0Q3919.0 -258 3919.0 -375Q3919.0 -492 3974.0 -580.0Q4029.0 -668 4128.5 -717.0Q4228.0 -766 4360.0 -766Q4492.0 -766 4591.5 -717.0Q4691.0 -668 4746.5 -580.0Q4802.0 -492 4802.0 -375Q4802.0 -258 4746.5 -170.0Q4691.0 -82 4591.5 -33.0Q4492.0 16 4360.0 16ZM4360.0 -153Q4438.0 -153 4494.0 -179.5Q4550.0 -206 4580.5 -256.0Q4611.0 -306 4611.0 -375Q4611.0 -444 4580.5 -494.0Q4550.0 -544 4494.0 -570.5Q4438.0 -597 4360.0 -597Q4283.0 -597 4227.0 -570.5Q4171.0 -544 4140.0 -494.0Q4109.0 -444 4109.0 -375Q4109.0 -306 4140.0 -256.0Q4171.0 -206 4227.0 -179.5Q4283.0 -153 4360.0 -153Z"/>';
const logo = color => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5021 930" style="width:100%;height:auto" aria-hidden="true" focusable="false"><g fill="' + color + '" transform="translate(90,840)">' + LOGO_PATHS + '</g></svg>';
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* Los dos íconos del botón ☰ viven siempre en el DOM y se alternan por CSS (.navburger[aria-expanded]):
   si se reemplazara el innerHTML en el clic, el target del evento quedaría fuera del DOM y el
   cierre por "clic afuera" lo tomaría como externo. */
const BURGER  = '<svg class="ico-abrir" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
                '<svg class="ico-cerrar" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ========================= utilidades ========================= */
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* /fason/alfajores.html, /fason/alfajores/ e /index.html se normalizan a la URL limpia */
function rutaActual(){
  let p = (location.pathname || '/').replace(/\.html$/, '').replace(/\/index$/, '/');
  if(p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/* href efectivo de un elemento, o null si no se debe mostrar */
function destino(p){
  if(p.activo) return p.url;
  if(p.ancla && document.querySelector(p.ancla)) return p.ancla;   // p. ej. "Cotizar" → formulario de la página actual
  return null;
}
const hijosActivos = p => (p.hijos || []).filter(h => h.activo);
const visible = p => !!destino(p) || hijosActivos(p).length > 0;

/* ========================= encabezado ========================= */
function markupNav(actual){
  const items = [];
  let boton = '';
  PAGINAS.forEach((p, i) => {
    if(!visible(p)) return;
    const href = destino(p);
    if(p.boton){
      boton = '<a class="btn" href="' + esc(href) + '">' + esc(p.nombre) + '</a>';
      return;
    }
    const hijos = hijosActivos(p);
    if(hijos.length){
      const abierto = p.activo ? [{ nombre: p.nombre, url: p.url, activo: true }] : [];   // si existe la página del padre, va primera en la lista
      const lista = abierto.concat(hijos);
      const esActual = lista.some(h => h.url === actual);
      const idSub = 'navsub-' + i;
      items.push(
        '<div class="navdrop">' +
        '<button type="button" class="' + (esActual ? 'actual' : '') + '" aria-expanded="false" aria-haspopup="true" aria-controls="' + idSub + '">' + esc(p.nombre) + CHEVRON + '</button>' +
        '<ul class="navsub" id="' + idSub + '" hidden>' +
        lista.map(h => '<li><a href="' + esc(h.url) + '"' + (h.url === actual ? ' class="actual" aria-current="page"' : '') + '>' + esc(h.nombre) + '</a></li>').join('') +
        '</ul></div>');
      return;
    }
    items.push('<a href="' + esc(href) + '"' + (p.url === actual ? ' class="actual" aria-current="page"' : '') + '>' + esc(p.nombre) + '</a>');
  });
  return '<div class="wrap navi">' +
    '<a href="/" aria-label="ALIPRO — Inicio"><div class="navlogo">' + logo('#C8102E') + '</div></a>' +
    '<div class="navlinks" id="navmenu">' + items.join('') + '</div>' +
    '<div class="navacc">' + boton +
    '<button type="button" class="navburger" aria-expanded="false" aria-controls="navmenu" aria-label="Abrir menú">' + BURGER + '</button>' +
    '</div></div>';
}

/* ========================= pie ========================= */
function markupPie(actual){
  const enlaces = [];
  PAGINAS.forEach(p => {
    if(!visible(p)) return;
    if(p.activo || (!p.hijos && destino(p))) enlaces.push({ nombre: p.nombre, url: destino(p) });
    hijosActivos(p).forEach(h => enlaces.push({ nombre: h.nombre, url: h.url }));
  });
  PIE_EXTRA.filter(p => p.activo).forEach(p => enlaces.push({ nombre: p.nombre, url: p.url }));
  return '<div class="wrap">' +
    '<div class="fotgrid">' +
    '<div>' +
    '<div class="fotlogo"><a href="/" aria-label="ALIPRO — Inicio">' + logo('#FFFFFF') + '</a></div>' +
    '<p>' + esc(LEMA) + '</p>' +
    '</div>' +
    '<div class="fotlinks">' +
    enlaces.map(e => '<a href="' + esc(e.url) + '"' + (e.url === actual ? ' aria-current="page"' : '') + '>' + esc(e.nombre) + '</a>').join('') +
    '<a href="mailto:' + EMAIL + '">[' + EMAIL + ']</a>' +
    '</div>' +
    '</div>' +
    '<div class="legal">' + esc(LEGAL) + '</div>' +
    '</div>';
}

/* ========================= comportamiento ========================= */
function comportamiento(nav){
  const menu   = nav.querySelector('#navmenu');
  const burger = nav.querySelector('.navburger');
  const drops  = Array.from(nav.querySelectorAll('.navdrop'));
  const esDesktop = () => window.matchMedia('(min-width:880px)').matches;

  /* --- desplegables --- */
  function setDrop(d, abrir){
    const b = d.querySelector('button'), ul = d.querySelector('.navsub');
    b.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    ul.hidden = !abrir;
  }
  const cerrarDrops = salvo => drops.forEach(d => { if(d !== salvo) setDrop(d, false); });
  const abiertoDrop = d => d.querySelector('button').getAttribute('aria-expanded') === 'true';

  drops.forEach(d => {
    const b = d.querySelector('button'), ul = d.querySelector('.navsub');
    /* Patrón "disclosure": abre y cierra con clic, toque, Enter o Espacio (los tres disparan click
       en un <button>). Sin apertura por hover: con mouse, abrir al pasar y cerrar al hacer clic
       es exactamente el comportamiento que confunde. */
    b.addEventListener('click', () => { const abrir = !abiertoDrop(d); cerrarDrops(d); setDrop(d, abrir); });
    b.addEventListener('keydown', e => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); cerrarDrops(d); setDrop(d, true); const a = ul.querySelector('a'); if(a) a.focus(); }
    });
    ul.addEventListener('keydown', e => {
      const links = Array.from(ul.querySelectorAll('a')), i = links.indexOf(document.activeElement);
      if(e.key === 'ArrowDown'){ e.preventDefault(); (links[i + 1] || links[0]).focus(); }
      if(e.key === 'ArrowUp'){ e.preventDefault(); if(i <= 0){ b.focus(); } else links[i - 1].focus(); }
    });
    /* si el foco se va del desplegable (Tab hacia afuera), se cierra */
    d.addEventListener('focusout', e => { if(!d.contains(e.relatedTarget)) setDrop(d, false); });
  });

  /* --- menú móvil (☰) --- */
  function setMenu(abrir){
    menu.classList.toggle('abierto', abrir);
    burger.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    burger.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
    if(!abrir) cerrarDrops();
  }
  const menuAbierto = () => burger.getAttribute('aria-expanded') === 'true';
  burger.addEventListener('click', () => setMenu(!menuAbierto()));
  /* al elegir un enlace (p. ej. un ancla de la misma página) el panel se cierra */
  menu.addEventListener('click', e => { if(e.target.closest('a') && !esDesktop()) setMenu(false); });

  /* --- Escape cierra lo que esté abierto y devuelve el foco; clic afuera cierra --- */
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    const d = drops.find(abiertoDrop);
    if(d){ setDrop(d, false); d.querySelector('button').focus(); return; }
    if(menuAbierto()){ setMenu(false); burger.focus(); }
  });
  document.addEventListener('click', e => {
    if(!nav.contains(e.target)){ cerrarDrops(); if(menuAbierto()) setMenu(false); }
  });
  /* si el viewport pasa a desktop con el panel abierto, se normaliza */
  window.matchMedia('(min-width:880px)').addEventListener('change', ev => { if(ev.matches && menuAbierto()) setMenu(false); });
}

/* ========================= arranque ========================= */
function init(){
  const actual = rutaActual();
  const phNav = document.getElementById('nav');
  if(phNav && phNav.tagName !== 'NAV'){
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Principal');
    nav.innerHTML = markupNav(actual);
    phNav.parentNode.replaceChild(nav, phNav);
    try{ comportamiento(nav); }catch(e){ /* sin JS de menú sigue siendo una barra con enlaces */ }
  }
  const phPie = document.getElementById('pie');
  if(phPie && phPie.tagName !== 'FOOTER'){
    const pie = document.createElement('footer');
    pie.innerHTML = markupPie(actual);
    phPie.parentNode.replaceChild(pie, phPie);
  }
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
