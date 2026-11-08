import type { CSSProperties, ReactNode } from 'react'

// Skeletons del shell: el mismo marcado que ldEsqueleto de
// /apps/shared/ui.js, así una sola hoja (/apps/shared/base.css) pinta los
// dos. El grupo es div.skel-grupo.skel-diferido (aparece a los 300 ms, no
// parpadea en cargas rápidas) con un «Cargando» solo para lector; cada
// pieza es span.skel.<variante> con aria-hidden.
//
// Patrón «cargado»: listas T[] | null (null = skeleton, [] = vacío real) y
// widgets T | null | undefined (undefined = <SkeletonWidget />). Nunca un
// skeleton eterno: un error deja [] y su mensaje.

type Variante = 'linea' | 'titulo' | 'circulo' | 'bloque'

/** Una pieza suelta: span.skel.skel-<variante>, oculta al lector. */
export function Skeleton({
  variante = 'linea',
  className,
  style,
}: {
  variante?: Variante
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`skel skel-${variante}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Contenedor de un bloque en carga. Con `anunciar` (por defecto) es una
 * región role=status; sin él solo lleva el «Cargando» para lector. Sin
 * aria-busy: en el mismo nodo que el status el lector puede posponer el
 * anuncio, y el grupo se desmonta sin pasar a false (si hace falta, lo pone
 * el contenedor, como ldEsqueleto).
 */
export function Cargando({
  etiqueta = 'Cargando',
  anunciar = true,
  className,
  children,
}: {
  etiqueta?: string
  anunciar?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={`skel-grupo skel-diferido${className ? ` ${className}` : ''}`}
      role={anunciar ? 'status' : undefined}
    >
      <span className="sr-only">{etiqueta}</span>
      {children}
    </div>
  )
}

/** n líneas de texto (la última, más corta). */
export function SkeletonLineas({ n = 3, anunciar }: { n?: number; anunciar?: boolean }) {
  return (
    <Cargando anunciar={anunciar}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </Cargando>
  )
}

/**
 * Filas de una lista que no es tabla (miembros, correos, canales): avatar
 * opcional y `lineas` líneas por fila. Equivale a ldEsqueleto(el, 'filas:n').
 */
export function SkeletonLista({
  n = 4,
  avatar = true,
  lineas = 3,
  anunciar,
}: {
  n?: number
  avatar?: boolean
  lineas?: number
  anunciar?: boolean
}) {
  return (
    <Cargando anunciar={anunciar}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skel-fila">
          {avatar && <Skeleton variante="circulo" />}
          {Array.from({ length: lineas }, (_, j) => (
            <Skeleton key={j} />
          ))}
        </div>
      ))}
    </Cargando>
  )
}

/** Mismo componente con el nombre en inglés que usan algunos planes. */
export const SkeletonList = SkeletonLista

/**
 * Filas de TABLA: devuelve <tr>, va dentro de un <tbody>. Una línea por
 * columna y el «Cargando» para lector en la primera celda.
 */
export function SkeletonFilas({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} className="skel-tr skel-diferido">
          {Array.from({ length: columnas }, (_, c) => (
            <td key={c}>
              {i === 0 && c === 0 && <span className="sr-only">Cargando</span>}
              <Skeleton />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Rejilla de n tarjetas con título y dos líneas. */
export function SkeletonTarjetas({ n = 4, anunciar }: { n?: number; anunciar?: boolean }) {
  return (
    <Cargando anunciar={anunciar}>
      <div className="skel-rejilla">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="skel-tarjeta">
            <Skeleton variante="titulo" />
            <Skeleton />
            <Skeleton />
          </div>
        ))}
      </div>
    </Cargando>
  )
}

/**
 * Un widget del Inicio mientras carga: título y dos líneas. Sin role=status
 * para no anunciar «Cargando» una vez por widget.
 */
export function SkeletonWidget() {
  return (
    <Cargando anunciar={false} className="skel-widget">
      <Skeleton variante="titulo" />
      <Skeleton />
      <Skeleton />
    </Cargando>
  )
}
