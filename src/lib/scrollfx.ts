// Animaciones suaves de aparición al hacer scroll (shell del portal).
// Los bloques directos de cada página (.page > *) entran con un fundido
// y un leve desplazamiento la primera vez que asoman en pantalla.
//
// Diseño deliberadamente conservador:
// - `prefers-reduced-motion: reduce` desactiva todo (accesibilidad).
// - Cada elemento anima UNA sola vez (se deja de observar al entrar).
// - Los elementos creados después de la ventana de registro (refrescos de
//   datos de los widgets, chat en vivo…) NO se animan: aparecen normales.
//   Así el contenido dinámico no parpadea cada vez que se actualiza.

const VENTANA_REGISTRO_MS = 1500

function reducirMovimiento(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// Registra los bloques de la página actual y devuelve la limpieza.
// Llamar en cada cambio de ruta (el componente ScrollFx lo hace).
export function initScrollFx(): () => void {
  if (reducirMovimiento() || typeof IntersectionObserver === 'undefined') {
    return () => {}
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('fx-in')
          io.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
  )

  const vistos = new WeakSet<Element>()

  function registrar() {
    const bloques = document.querySelectorAll('.content .page > *')
    let i = 0
    bloques.forEach((el) => {
      if (vistos.has(el)) return
      vistos.add(el)
      // Escalonado corto por lote para que la entrada se sienta fluida
      ;(el as HTMLElement).style.transitionDelay = `${Math.min(i * 45, 270)}ms`
      el.classList.add('fx-reveal')
      io.observe(el)
      i++
    })
  }

  registrar()

  // Ventana breve para lo que la página pinta tras cargar sus datos
  // (widgets del inicio, listas). Después, el contenido nuevo no se anima.
  const mo = new MutationObserver(() => registrar())
  const content = document.querySelector('.content')
  if (content) mo.observe(content, { childList: true, subtree: true })
  const timer = window.setTimeout(() => mo.disconnect(), VENTANA_REGISTRO_MS)

  return () => {
    window.clearTimeout(timer)
    mo.disconnect()
    io.disconnect()
    // Nada queda a medio animar al salir de la ruta
    document.querySelectorAll('.fx-reveal:not(.fx-in)').forEach((el) => el.classList.add('fx-in'))
  }
}
