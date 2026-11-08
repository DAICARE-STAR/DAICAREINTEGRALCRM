import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

// Accesibilidad de diálogos y hojas del shell, las mismas reglas que
// ldDialogo de /apps/shared/ui.js (ver GUIA-UI.md, «Modales y drawers»):
//   - al activarse guarda quién tenía el foco y enfoca el inicial;
//   - Tab y Shift+Tab quedan dentro de la caja (salvo aria-modal="false");
//   - Escape pide el cierre (con confirmación si hay cambios sin guardar);
//   - al cerrarse el foco vuelve a quien abrió, salvo que ya se haya movido.
// No muestra ni oculta nada: eso lo sigue haciendo el componente.
//
// El teclado se atiende en document, en burbuja: un control de dentro que
// necesite su propio Escape (un combobox, el globo de <InfoI>) lo reclama con
// preventDefault o stopPropagation y el diálogo no se cierra. Con varios
// abiertos, solo el de arriba de la pila atiende.

export interface OpcionesDialogo {
  /** Cierra de verdad (desmontar o poner activo en false). */
  alCerrar: () => void
  /** false mientras la caja está montada pero oculta. Por defecto true. */
  activo?: boolean
  /** Campo que recibe el foco al abrir (ref o selector dentro de la caja). */
  focoInicial?: RefObject<HTMLElement | null> | string
  /** true si hay cambios sin guardar: Escape y el fondo preguntan antes. */
  sucio?: () => boolean
  /** false: Escape no cierra (dejar el motivo escrito en el código). */
  escape?: boolean
  /**
   * A dónde vuelve el foco al cerrar si quien abrió ya no existe (p. ej. el
   * ítem de un menú que se cerró al elegirlo).
   */
  retorno?: RefObject<HTMLElement | null> | (() => HTMLElement | null)
}

const ENFOCABLES =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable="true"], ' +
  '[tabindex]:not([tabindex="-1"])'
const CAMPOS =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

// Visible = ocupa sitio en pantalla y no está oculto por visibility o inert
function visible(el: Element): boolean {
  if (!el.isConnected || !el.getClientRects().length) return false
  if (el.closest('[inert]')) return false
  return getComputedStyle(el).visibility !== 'hidden'
}

/** Los elementos enfocables y visibles de `el`, en orden de tabulación del DOM. */
export function enfocables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(visible)
}

interface Entrada {
  el: HTMLElement
  // Las opciones del último render (alCerrar y sucio cambian en cada uno)
  opciones: { current: OpcionesDialogo }
  quienAbrio: HTMLElement | null
}

// Pila de diálogos activos: solo el de arriba atiende el teclado
const pila: Entrada[] = []

// Quién tenía el foco antes del último cambio: si un autoFocus ya metió el
// foco en la caja cuando el hook se activa, quien abrió es este
let focoPrevio: HTMLElement | null = null

function pedirCierre(o: OpcionesDialogo) {
  if (o.sucio?.() && !window.confirm('¿Descartar los cambios sin guardar?')) return
  o.alCerrar()
}

function alTeclear(e: KeyboardEvent) {
  const tope = pila[pila.length - 1]
  if (!tope || e.defaultPrevented || e.isComposing) return
  const o = tope.opciones.current

  if (e.key === 'Escape' || e.key === 'Esc') {
    if (o.escape === false) return
    // Un solo cierre: ni el Escape de otros paneles ni el del cajón móvil
    e.preventDefault()
    e.stopImmediatePropagation()
    pedirCierre(o)
    return
  }

  if (e.key !== 'Tab' || tope.el.getAttribute('aria-modal') === 'false') return
  const f = enfocables(tope.el)
  const act = document.activeElement
  if (!f.length) {
    e.preventDefault()
    tope.el.focus()
    return
  }
  const dentro = !!act && tope.el.contains(act)
  if (e.shiftKey) {
    if (!dentro || act === f[0] || act === tope.el) {
      e.preventDefault()
      f[f.length - 1].focus()
    }
  } else if (!dentro || act === f[f.length - 1]) {
    e.preventDefault()
    f[0].focus()
  }
}

// Se registra al cargar el módulo, antes que los keydown de los paneles del
// shell: así stopImmediatePropagation les gana
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', alTeclear)
  document.addEventListener(
    'focusin',
    (e) => {
      focoPrevio = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null
    },
    true
  )
}

function enfocarInicial(el: HTMLElement, o: OpcionesDialogo) {
  // Un autoFocus de dentro ya eligió el campo
  if (el.contains(document.activeElement)) return
  let t: HTMLElement | null = null
  if (typeof o.focoInicial === 'string') t = el.querySelector<HTMLElement>(o.focoInicial)
  else if (o.focoInicial) t = o.focoInicial.current
  t ??= el.querySelector<HTMLElement>('[data-foco]')
  t ??= Array.from(el.querySelectorAll<HTMLElement>(CAMPOS)).find(visible) ?? null
  t ??= enfocables(el)[0] ?? null
  ;(t ?? el).focus({ preventScroll: true })
}

// Un destino al que todavía se puede volver
const vigente = (x: HTMLElement | null | undefined) =>
  x && x.isConnected && x !== document.body ? x : null

function devolverFoco(e: Entrada) {
  // El foco vuelve salvo que el componente ya lo haya movido a otro sitio
  const act = document.activeElement
  const perdido = !act || act === document.body || e.el.contains(act) || !act.isConnected
  if (!perdido) return
  const r = e.opciones.current.retorno
  const destino = vigente(e.quienAbrio) ?? vigente(typeof r === 'function' ? r() : r?.current)
  if (destino) destino.focus({ preventScroll: true })
  // Sin a quién volver, el foco no se queda en una caja ya oculta
  else if (act && e.el.contains(act) && act instanceof HTMLElement) act.blur()
}

/**
 * Diálogo accesible sobre la caja de `ref` (la caja, no el velo). Devuelve
 * pedirCierre(), que respeta `sucio`: úsalo para el clic en el fondo.
 */
export function useDialogo(ref: RefObject<HTMLElement | null>, opciones: OpcionesDialogo) {
  const activo = opciones.activo ?? true
  const actuales = useRef(opciones)
  // Primero de los efectos: la activación de abajo ya ve las opciones nuevas
  useLayoutEffect(() => {
    actuales.current = opciones
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!activo || !el) return
    const act = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const quienAbrio = act && el.contains(act) ? focoPrevio : act
    const entrada: Entrada = { el, opciones: actuales, quienAbrio }
    pila.push(entrada)
    enfocarInicial(el, actuales.current)

    return () => {
      const i = pila.indexOf(entrada)
      if (i >= 0) pila.splice(i, 1)
      // En diferido: el desmontaje ya sacó la caja del DOM, y si la caja se
      // vuelve a registrar enseguida (StrictMode) el foco se queda donde está
      queueMicrotask(() => {
        if (pila.some((x) => x.el === el)) return
        devolverFoco(entrada)
      })
    }
  }, [activo, ref])

  const cerrar = useCallback(() => pedirCierre(actuales.current), [])
  return { pedirCierre: cerrar }
}
