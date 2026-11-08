import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

// Arrastre de los widgets del Inicio (1.11.24), sin librería. Se toma una
// tarjeta por su asa:
// - con puntero: la tarjeta sigue al cursor y el destino se marca con
//   data-destino; el orden solo cambia (y se guarda) al soltar; junto al
//   borde de arriba o de abajo la página se desplaza sola (1.11.32);
// - con teclado: Espacio o Enter la toma, las flechas la mueven (el orden
//   cambia en pantalla sin guardar), Espacio o Enter la suelta y guarda,
//   Escape o salir del asa restaura el orden de antes.
// Con lector de pantalla en modo exploración las flechas no llegan al asa:
// para eso cada tarjeta trae además Subir y Bajar (moverPaso).
// Los vecinos se calculan sobre las tarjetas pintadas ([data-widget-id]):
// un widget sin datos no se pinta y no cuenta como posición.

export interface OpcionesArrastre<F> {
  /** Contenedor de la grilla (.widgets-area), siempre montado */
  area: RefObject<HTMLElement | null>
  /** Ids visibles en su orden actual (incluye los que no se pintan) */
  ids: readonly string[]
  nombre: (id: string) => string
  /** Lleva `id` al índice `destino` entre los visibles; guarda si se pide */
  mover: (id: string, destino: number, guardar: boolean) => void
  /** Guarda el orden que está en pantalla */
  confirmar: () => void
  foto: () => F
  restaurar: (foto: F) => void
  anunciar: (texto: string) => void
}

interface Arrastre {
  id: string
  pointerId: number
  x0: number
  y0: number
  scroll0: number
  ultimo: { x: number; y: number }
  tarjeta: HTMLElement
  destino: { id: string; despues: boolean } | null
  movido: boolean
}

const UMBRAL = 4
// Cerca del borde de la ventana la página se desplaza sola, más rápido
// cuanto más cerca (hasta VELOCIDAD px por cuadro)
const BORDE = 64
const VELOCIDAD = 18

/** Píxeles que se desplaza la ventana en un cuadro con el puntero en `y` (negativo: hacia arriba). */
export function velocidadBorde(y: number, alto: number): number {
  const borde = Math.min(BORDE, alto / 4)
  if (y < borde) return -Math.ceil(VELOCIDAD * Math.min(1, (borde - y) / borde))
  if (y > alto - borde) return Math.ceil(VELOCIDAD * Math.min(1, (y - alto + borde) / borde))
  return 0
}

function leerPintados(area: HTMLElement | null): string[] {
  if (!area) return []
  return [...area.querySelectorAll<HTMLElement>('[data-widget-id]')].map((e) => e.dataset.widgetId ?? '')
}

export function useArrastreWidgets<F>(o: OpcionesArrastre<F>) {
  const [tomado, setTomado] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  // Tarjetas pintadas, en orden: los widgets cargan y se ocultan solos sin
  // que el Dashboard vuelva a pintarse, así que se observan en el DOM
  const [pintados, setPintados] = useState<string[]>([])
  const arrastre = useRef<Arrastre | null>(null)
  const fotoTeclado = useRef<F | null>(null)
  // Al reordenar, React mueve el nodo y el asa pierde el foco: no es salir
  const reenfocar = useRef<string | null>(null)
  // Al salir con Tab o clic, restaurar el orden mueve nodos y el control de
  // destino puede perder el foco: se le devuelve
  const devolverFoco = useRef<HTMLElement | null>(null)
  const opciones = useRef(o)
  opciones.current = o

  useEffect(() => {
    const area = o.area.current
    if (!area) return
    const leer = () =>
      setPintados((antes) => {
        const ahora = leerPintados(area)
        return ahora.join() === antes.join() ? antes : ahora
      })
    leer()
    const mo = new MutationObserver(leer)
    mo.observe(area, { childList: true })
    return () => mo.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const destino = devolverFoco.current
    if (destino) {
      devolverFoco.current = null
      if (destino.isConnected && document.activeElement !== destino) destino.focus()
    }
    const id = reenfocar.current
    if (!id) return
    reenfocar.current = null
    opciones.current.area.current?.querySelector<HTMLButtonElement>(`[data-asa="${id}"]`)?.focus()
  })

  function limpiarDestino() {
    opciones.current.area.current
      ?.querySelectorAll('[data-destino]')
      .forEach((e) => {
        e.removeAttribute('data-destino')
        e.removeAttribute('data-eje')
      })
  }

  function terminar() {
    const a = arrastre.current
    if (!a) return
    a.tarjeta.style.transform = ''
    a.tarjeta.removeAttribute('data-arrastrando')
    limpiarDestino()
    arrastre.current = null
    setArrastrando(null)
  }

  function soltarTeclado(id: string, conFoco: boolean) {
    if (fotoTeclado.current !== null) opciones.current.restaurar(fotoTeclado.current)
    fotoTeclado.current = null
    setTomado(null)
    reenfocar.current = conFoco ? id : null
    opciones.current.anunciar('Movimiento cancelado')
  }

  // La tarjeta sigue al puntero (más lo que se desplazó la página) y la que
  // queda debajo se marca como destino
  function apuntar(a: Arrastre) {
    const { x, y } = a.ultimo
    a.tarjeta.style.transform = `translate(${x - a.x0}px, ${y - a.y0 + (window.scrollY - a.scroll0)}px)`
    const area = opciones.current.area.current
    const bajo = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-widget-id]')
    const vecino = bajo?.dataset.widgetId
    limpiarDestino()
    if (!area || !bajo || !vecino || vecino === a.id || !area.contains(bajo)) {
      a.destino = null
      return
    }
    // En media columna decide la mitad izquierda o derecha; a todo el ancho, la de arriba o abajo
    const r = bajo.getBoundingClientRect()
    const mediaColumna = r.width < area.getBoundingClientRect().width * 0.75
    const despues = mediaColumna ? x > r.left + r.width / 2 : y > r.top + r.height / 2
    a.destino = { id: vecino, despues }
    bajo.setAttribute('data-destino', despues ? 'despues' : 'antes')
    bajo.setAttribute('data-eje', mediaColumna ? 'x' : 'y')
  }

  // Durante un arrastre con puntero: Escape cancela; si el asa se desmonta a
  // mitad (el widget se ocultó), sus eventos ya no llegan y se limpia desde
  // document; el desplazamiento de la página se suma a la tarjeta y cambia
  // lo que queda bajo el puntero
  useEffect(() => {
    if (!arrastrando) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return
      e.preventDefault()
      e.stopPropagation()
      terminar()
      opciones.current.anunciar('Movimiento cancelado')
    }
    function onFin() {
      const a = arrastre.current
      if (a && !a.tarjeta.isConnected) terminar()
    }
    function onScroll() {
      const a = arrastre.current
      if (a) apuntar(a)
    }
    // Con el puntero junto al borde, la página se desplaza sola. Hacia abajo
    // solo hasta donde llegaba antes de tomar la tarjeta: la tarjeta movida
    // alarga la página y, sin tope, se seguiría bajando sin fin
    const tope = document.documentElement.scrollHeight - window.innerHeight
    let cuadro = requestAnimationFrame(function desplazar() {
      const a = arrastre.current
      if (a) {
        const v = velocidadBorde(a.ultimo.y, window.innerHeight)
        const y0 = window.scrollY
        const y = v < 0 ? Math.max(0, y0 + v) : Math.min(Math.max(tope, y0), y0 + v)
        // instant: el html tiene scroll-behavior smooth
        if (y !== y0) window.scrollTo({ top: y, behavior: 'instant' })
      }
      cuadro = requestAnimationFrame(desplazar)
    })
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerup', onFin, true)
    document.addEventListener('pointercancel', onFin, true)
    document.addEventListener('lostpointercapture', onFin, true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(cuadro)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerup', onFin, true)
      document.removeEventListener('pointercancel', onFin, true)
      document.removeEventListener('lostpointercapture', onFin, true)
      window.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastrando])

  // La tarjeta tomada con teclado desapareció (se ocultó o se quedó sin datos)
  useEffect(() => {
    if (tomado && !pintados.includes(tomado)) soltarTeclado(tomado, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tomado, pintados])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => terminar(), [])

  /** Índice destino entre los visibles para dejar `id` antes o después de `vecino`. */
  function destinoJunto(id: string, vecino: string, despues: boolean): number {
    const sin = o.ids.filter((x) => x !== id)
    const i = sin.indexOf(vecino)
    return despues ? i + 1 : i
  }

  function anunciarPosicion(id: string, posicion: number, total: number, sufijo = '') {
    o.anunciar(`${o.nombre(id)}, posición ${posicion} de ${total}${sufijo}`)
  }

  /** Un paso hacia atrás (−1) o adelante (+1) entre las tarjetas pintadas. */
  function moverPaso(id: string, dir: -1 | 1, guardar: boolean): boolean {
    const p = leerPintados(o.area.current)
    const i = p.indexOf(id)
    const vecino = p[i + dir]
    if (i < 0 || !vecino) return false
    reenfocar.current = guardar ? null : id
    o.mover(id, destinoJunto(id, vecino, dir > 0), guardar)
    anunciarPosicion(id, i + dir + 1, p.length)
    return true
  }

  // Un arrastre cuya tarjeta se desmontó antes del umbral no bloquea las asas
  function descartarHuerfano() {
    if (arrastre.current && !arrastre.current.tarjeta.isConnected) terminar()
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    descartarHuerfano()
    // Un segundo dedo o botón no pisa el arrastre en curso
    if (e.button !== 0 || tomado || arrastre.current) return
    const tarjeta = e.currentTarget.closest<HTMLElement>('[data-widget-id]')
    if (!tarjeta) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* puntero ya liberado: sin captura, los eventos siguen llegando al asa */
    }
    arrastre.current = {
      id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      scroll0: window.scrollY,
      ultimo: { x: e.clientX, y: e.clientY },
      tarjeta,
      destino: null,
      movido: false,
    }
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const a = arrastre.current
    if (!a || a.pointerId !== e.pointerId) return
    a.ultimo = { x: e.clientX, y: e.clientY }
    if (!a.movido) {
      const dy = e.clientY - a.y0 + (window.scrollY - a.scroll0)
      if (Math.hypot(e.clientX - a.x0, dy) < UMBRAL) return
      a.movido = true
      a.tarjeta.setAttribute('data-arrastrando', '')
      setArrastrando(a.id)
    }
    apuntar(a)
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    const a = arrastre.current
    if (!a || a.pointerId !== e.pointerId) return
    const { id, destino, movido } = a
    terminar()
    if (!movido || !destino) return
    o.mover(id, destinoJunto(id, destino.id, destino.despues), true)
    const p = leerPintados(o.area.current).filter((x) => x !== id)
    const j = p.indexOf(destino.id) + (destino.despues ? 1 : 0)
    anunciarPosicion(id, j + 1, p.length + 1, '. Orden guardado')
    reenfocar.current = id
  }

  // pointercancel o pérdida de la captura con el asa todavía montada
  function onPointerCancel(e: PointerEvent<HTMLButtonElement>) {
    if (arrastre.current?.pointerId === e.pointerId) terminar()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    descartarHuerfano()
    const k = e.key
    const tomarOSoltar = k === ' ' || k === 'Enter'
    // Espacio sostenido no toma y suelta en ráfaga
    if (tomarOSoltar && e.repeat) {
      e.preventDefault()
      return
    }
    if (!tomado) {
      if (!tomarOSoltar || arrastre.current) return
      e.preventDefault()
      fotoTeclado.current = o.foto()
      setTomado(id)
      const p = leerPintados(o.area.current)
      anunciarPosicion(id, p.indexOf(id) + 1, p.length, '. Tomado')
      return
    }
    if (tomado !== id) return
    if (k === 'Escape' || k === 'Esc') {
      e.preventDefault()
      e.stopPropagation()
      soltarTeclado(id, true)
    } else if (tomarOSoltar) {
      e.preventDefault()
      o.confirmar()
      fotoTeclado.current = null
      setTomado(null)
      o.anunciar(`${o.nombre(id)} soltado. Orden guardado`)
    } else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowDown' || k === 'ArrowRight') {
      e.preventDefault()
      moverPaso(id, k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1, false)
    }
  }

  function onBlur(e: FocusEvent<HTMLButtonElement>, id: string) {
    // El reordenamiento del DOM quita el foco un instante: no es salir
    if (tomado !== id || reenfocar.current === id) return
    // Salió con Tab, con un clic o a algo no enfocable: cancela sin robar el
    // foco, y lo deja donde iba aunque restaurar el orden mueva ese control
    devolverFoco.current = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null
    soltarTeclado(id, false)
  }

  return {
    tomado,
    arrastrando,
    pintados,
    moverPaso,
    propsAsa: (id: string) => ({
      'data-asa': id,
      'aria-pressed': tomado === id,
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => onPointerDown(e, id),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, id),
      onBlur: (e: FocusEvent<HTMLButtonElement>) => onBlur(e, id),
    }),
  }
}
