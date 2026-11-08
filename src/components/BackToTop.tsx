import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { initScrollFx } from '../lib/scrollfx'

// Botón flotante «volver arriba» + animaciones de aparición por ruta.
// Viven juntos porque ambos dependen del scroll de la ventana y del
// cambio de página (el shell desplaza en window, no en .content).
export default function BackToTop() {
  const [visible, setVisible] = useState(false)
  const { pathname } = useLocation()

  // Animaciones de aparición: se re-registran en cada cambio de ruta
  useEffect(() => initScrollFx(), [pathname])

  // Cambiar de página vuelve arriba (el router no lo hace solo) y el
  // botón aparece tras un desplazamiento apreciable.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    let raf = 0
    function onScroll() {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        setVisible(window.scrollY > 420)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  function subir() {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' })
  }

  return (
    <button
      type="button"
      className={`back-to-top ${visible ? 'on' : ''}`}
      onClick={subir}
      aria-label="Volver arriba"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}
