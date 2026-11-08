import { useState } from 'react'

// Información indispensable junto a un control o un dato, en lugar de una
// leyenda en pantalla (GUIA-UI.md, «Accesibilidad»): un «i» con el texto en
// title y aria-label. Con el ratón se ve el title; con teclado o toque, el
// globo de /apps/shared/base.css, que Escape cierra sin mover el foco (el
// primer Escape no llega al diálogo que lo contiene). Mismo comportamiento
// que .info-i en las apps con ui.js.
export default function InfoI({ texto }: { texto: string }) {
  const [cerrado, setCerrado] = useState(false)

  return (
    <span
      className="info-i"
      tabIndex={0}
      role="img"
      aria-label={texto}
      title={texto}
      data-cerrado={cerrado ? '' : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Escape' || e.key === 'Esc') && !cerrado) {
          setCerrado(true)
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') setCerrado(true)
      }}
      onBlur={() => setCerrado(false)}
    >
      i
    </span>
  )
}
