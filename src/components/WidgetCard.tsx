import { createContext, useContext, type ReactNode } from 'react'
import { Link } from 'react-router'
import InfoI from './InfoI'
import { SkeletonWidget } from './Skeleton'

// Tarjeta de un widget del Inicio. El Dashboard pone en el contexto el id,
// el nombre (el de Administración → Widgets, o el del código si no hay
// tabla) y si ocupa todo el ancho de la grilla; cada widget solo aporta su
// sufijo, sus acciones y su cuerpo. Sin datos el widget sigue devolviendo
// null: la grilla queda sin su tarjeta y, si no queda ninguna,
// .widgets-area:empty muestra el vacío del Inicio.

export interface DatosWidget {
  id: string
  nombre: string
  ancho: boolean
  /** Control para reubicar la tarjeta (asa o flechas), lo pone el Dashboard */
  asa?: ReactNode
}

export const WidgetContext = createContext<DatosWidget>({ id: 'widget', nombre: '', ancho: false })

function clases(ancho: boolean): string {
  return ancho ? 'widget widget-ancho' : 'widget'
}

export function WidgetCard({
  sufijo,
  info,
  lado,
  children,
}: {
  /** Detalle tras el nombre («· 3 pendientes»), sin el punto medio */
  sufijo?: ReactNode
  /** Texto del «i» junto al título (solo lo indispensable) */
  info?: string
  /** Acciones y enlaces a la derecha del título */
  lado?: ReactNode
  children: ReactNode
}) {
  const { id, nombre, ancho, asa } = useContext(WidgetContext)
  const idTitulo = `inicio-widget-${id}`
  const titulo = (
    <h2 id={idTitulo}>
      {nombre}
      {sufijo != null && sufijo !== false && sufijo !== '' && (
        <span className="muted small"> · {sufijo}</span>
      )}
    </h2>
  )
  return (
    <section className={clases(ancho)} aria-labelledby={idTitulo} data-widget-id={id}>
      <div className="widget-head">
        {asa}
        {info ? (
          <div className="titulo-info">
            {titulo}
            <InfoI texto={info} />
          </div>
        ) : (
          titulo
        )}
        {lado && <div className="widget-head-side">{lado}</div>}
      </div>
      {children}
    </section>
  )
}

/** El widget mientras carga: la misma tarjeta, así la grilla no salta. */
export function WidgetCargando() {
  const { id, nombre, ancho } = useContext(WidgetContext)
  return (
    <section className={clases(ancho)} aria-label={nombre || undefined} data-widget-id={id}>
      <SkeletonWidget />
    </section>
  )
}

/** Enlace a lo que no cabe en la tarjeta. Nada si no hay más. */
export function WidgetMas({ n, to }: { n: number; to: string }) {
  if (n <= 0) return null
  return (
    <p className="widget-nota small">
      <Link to={to}>Ver {n} más →</Link>
    </p>
  )
}
