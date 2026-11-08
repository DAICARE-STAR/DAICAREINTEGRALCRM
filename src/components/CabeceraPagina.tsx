import type { ReactNode } from 'react'
import { useCabecera } from '../context/CabeceraContext'
import InfoI from './InfoI'

interface Props {
  titulo: ReactNode
  /** Icono del módulo (IconosNav o AppIcon); decorativo. */
  icono?: ReactNode
  ayuda?: string
  /** Ventana interna activa del visor de apps («— Subtareas»). */
  sufijo?: string | null
  pestanas?: ReactNode
  nivel?: 1 | 2
  className?: string
  children?: ReactNode
}

// Cabecera única de cada vista del shell (GUIA-UI.md, «Cabeceras»): icono
// del módulo, título (h1; h2 en las secciones de Administración), las
// acciones a la derecha como botones (hijos) y, si la vista las tiene, las
// pestañas debajo. Sin línea de dato bajo el título: un conteo o una fecha
// va en la primera línea del contenido. El sufijo de ventana del visor y el
// «i» de ayuda van fuera del encabezado: no entran en su nombre accesible.
//
// El h1 no se pinta aquí: va a la cabecera fija del marco (Layout), que no
// se desmonta al navegar; esta llamada solo la alimenta. El nivel 2 sigue
// en su sitio, como subtítulo de su sección. Fuera del shell (sin
// CabeceraProvider) la cabecera se pinta en su sitio.
export default function CabeceraPagina({ nivel = 1, className, children, ...datos }: Props) {
  const enMarco = useCabecera(nivel === 1 ? { ...datos, acciones: children } : null)
  if (nivel === 1 && enMarco) return null
  return (
    <CabeceraVista {...datos} nivel={nivel} className={className}>
      {children}
    </CabeceraVista>
  )
}

/** El marcado de la cabecera; lo usan el marco del shell y el nivel 2. */
export function CabeceraVista({
  titulo,
  icono,
  ayuda,
  sufijo,
  pestanas,
  nivel = 1,
  className,
  children,
}: Props) {
  const Encabezado = nivel === 2 ? 'h2' : 'h1'
  return (
    <header className={className ? `cabecera ${className}` : 'cabecera'}>
      <div className="cabecera-fila">
        {icono && (
          <span className="cabecera-icono" aria-hidden="true">
            {icono}
          </span>
        )}
        <div className="titulo-info">
          <Encabezado>{titulo}</Encabezado>
          {sufijo && <span className="cabecera-sufijo">— {sufijo}</span>}
          {ayuda && <InfoI texto={ayuda} />}
        </div>
        {children && <div className="cabecera-acciones">{children}</div>}
      </div>
      {pestanas}
    </header>
  )
}
