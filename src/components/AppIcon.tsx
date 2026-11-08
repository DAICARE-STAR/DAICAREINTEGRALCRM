import { resolverIcono, type Forma } from '../lib/iconos-apps'

// Icono de una app o herramienta. Con `clave` (slug de la app o
// toolPermKey(nombre) de la herramienta) pinta el icono propio de
// src/lib/iconos-apps.ts; si no hay, el campo `icon` («/icons/x.svg» o
// URL https). Los valores emoji heredados se ignoran: en su lugar se
// muestra el glifo neutro de la marca (anillos LD).
interface Props {
  icon: string | null
  size?: 'sm' | 'lg'
  clave?: string | null
}

function RingsGlyph({ size }: { size: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 26 : 15
  return (
    <svg
      className={`icon-img icon-${size} icon-rings`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="6.5" strokeWidth="1.1" />
    </svg>
  )
}

function LineGlyph({ size, formas }: { size: 'sm' | 'lg'; formas: readonly Forma[] }) {
  return (
    <svg
      className={`icon-img icon-${size} icon-linea`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {formas.map((f, i) => {
        if (f.t === 'path') return <path key={i} d={f.d} />
        if (f.t === 'circle') return <circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
        return <rect key={i} x={f.x} y={f.y} width={f.width} height={f.height} rx={f.rx} />
      })}
    </svg>
  )
}

export default function AppIcon({ icon, size = 'lg', clave }: Props) {
  const r = resolverIcono(clave, icon)
  if (r.tipo === 'linea') return <LineGlyph size={size} formas={r.formas} />
  if (r.tipo === 'imagen') {
    return <img className={`icon-img icon-${size}`} src={r.src} alt="" loading="lazy" />
  }
  return <RingsGlyph size={size} />
}
