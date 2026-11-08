import type { CSSProperties } from 'react'

// Pantalla de carga: un anillo neutro que se traza solo en bucle (dibujo →
// pausa → fundido). Sustituye al texto "Cargando…" del shell. Con
// prefers-reduced-motion el anillo queda estático.

// radio, grosor y circunferencia (2πr) del anillo, sobre un lienzo de 512
const ANILLOS = [{ r: 220, sw: 24, c: 1382 }]

export default function LogoLoader({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-label={label}>
      <svg className="logo-loader" viewBox="0 0 512 512" width="86" height="86" aria-hidden="true">
        {ANILLOS.map((a) => (
          <circle
            key={a.r}
            className="logo-loader-anillo"
            style={{ '--c': a.c } as CSSProperties}
            cx="256"
            cy="256"
            r={a.r}
            strokeWidth={a.sw}
          />
        ))}
      </svg>
    </div>
  )
}
