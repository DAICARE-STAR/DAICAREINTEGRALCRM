/* Tema del producto — se aplica ANTES de pintar (sin parpadeo). Script clásico
   sin defer, de 'self' (lo admite la CSP del shell); index.html lo carga
   antes de todo.

   Resuelve el tema guardado (pt_tema_v1 → data-theme) y aplica las primitivas
   de color de la instalación guardadas en caché (pt_tema_valores_v1) con
   setProperty, que es CSSOM y no lo bloquea la CSP. Solo acepta claves de la
   lista PRIMITIVAS y valores #rrggbb: así ninguna caché manipulada inyecta
   CSS. En la primera visita de un navegador no hay caché y se ve un instante
   la paleta neutra (PP-DEC-14); el contexto de instalación la refresca.

   La preferencia es por navegador y se sigue en vivo entre pestañas con el
   evento `storage`. Probado en src/lib/__tests__/tema-js.test.ts con node:vm. */

(function () {
  var TEMAS = ['claro', 'calido', 'oscuro'];
  var POR_DEFECTO = 'claro';
  var CLAVE_TEMA = 'pt_tema_v1';
  var CLAVE_VALORES = 'pt_tema_valores_v1';
  // Tema por defecto de la instalación (N-5): vale si el navegador no eligió uno
  var CLAVE_DEFECTO = 'pt_tema_defecto_v1';
  // Primitivas de color de src/estilos/paleta.css que una instalación puede
  // redefinir. La prueba exige que coincida con las de la hoja.
  var PRIMITIVAS = [
    '--pal-base-0', '--pal-base-50', '--pal-base-100', '--pal-base-200', '--pal-base-300', '--pal-base-400',
    '--pal-base-500', '--pal-base-700', '--pal-base-800', '--pal-base-850', '--pal-base-900',
    '--pal-acento-200', '--pal-acento-300', '--pal-acento-500', '--pal-acento-600', '--pal-acento-700',
    '--pal-borde-control', '--pal-placeholder', '--pal-placeholder-sobre-oscuro',
    '--pal-exito', '--pal-aviso', '--pal-error', '--pal-info',
    '--pal-exito-sobre-oscuro', '--pal-aviso-sobre-oscuro', '--pal-error-sobre-oscuro', '--pal-info-sobre-oscuro'
  ];
  var HEX = /^#[0-9a-f]{6}$/;

  function leerTema() {
    var t = null;
    var d = null;
    try {
      t = localStorage.getItem(CLAVE_TEMA);
      d = localStorage.getItem(CLAVE_DEFECTO);
    } catch (e) { /* sin almacenamiento */ }
    if (TEMAS.indexOf(t) >= 0) return t;
    return TEMAS.indexOf(d) < 0 ? POR_DEFECTO : d;
  }

  function leerValores() {
    try {
      var v = JSON.parse(localStorage.getItem(CLAVE_VALORES) || 'null');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function aplicarValores(valores) {
    var estilo = document.documentElement.style;
    for (var i = 0; i < PRIMITIVAS.length; i++) estilo.removeProperty(PRIMITIVAS[i]);
    if (!valores) return;
    for (var clave in valores) {
      if (!Object.prototype.hasOwnProperty.call(valores, clave)) continue;
      if (PRIMITIVAS.indexOf(clave) < 0) continue;
      var valor = typeof valores[clave] === 'string' ? valores[clave].toLowerCase() : '';
      if (HEX.test(valor)) estilo.setProperty(clave, valor);
    }
  }

  function aplicar() {
    window.PT_TEMA = leerTema();
    document.documentElement.setAttribute('data-theme', window.PT_TEMA);
    aplicarValores(leerValores());
  }

  window.PT_TEMAS = TEMAS;
  window.PT_PRIMITIVAS = PRIMITIVAS;
  window.ptLeerTema = leerTema;
  window.ptAplicarTema = function (t) {
    if (TEMAS.indexOf(t) < 0) t = POR_DEFECTO;
    try { localStorage.setItem(CLAVE_TEMA, t); } catch (e) { /* solo esta sesión */ }
    aplicar();
  };
  // Guarda en caché las primitivas de la instalación (null las borra) y repinta
  window.ptGuardarValores = function (valores) {
    try {
      if (valores) localStorage.setItem(CLAVE_VALORES, JSON.stringify(valores));
      else localStorage.removeItem(CLAVE_VALORES);
    } catch (e) { /* solo esta sesión */ }
    aplicar();
  };

  // Guarda el tema por defecto de la instalación (null lo borra) y repinta
  window.ptGuardarDefecto = function (t) {
    try {
      if (TEMAS.indexOf(t) >= 0) localStorage.setItem(CLAVE_DEFECTO, t);
      else localStorage.removeItem(CLAVE_DEFECTO);
    } catch (e) { /* solo esta sesión */ }
    aplicar();
  };

  aplicar();
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === CLAVE_TEMA || e.key === CLAVE_VALORES || e.key === CLAVE_DEFECTO) aplicar();
  });
})();
