import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { indiceSiguiente } from '../lib/teclado'

// Pestañas accesibles del shell (tablist/tab/tabpanel), con las clases de
// siempre (.tabs, .tab, .tab-active). Flechas, Inicio y Fin mueven el foco y
// activan la pestaña (activación automática); Tab entra solo en la activa
// (tabindex itinerante). Con `grupo`, la primera pestaña de cada grupo nuevo
// lleva .tab-grupo-inicio, que la separa visualmente de la anterior.
// Equivale a ldPestanas de /apps/shared/ui.js.

export interface Pestana<T extends string = string> {
  id: T
  label: string
  grupo?: string
}

const idTab = (idBase: string, id: string) => `${idBase}-tab-${id}`
const idPanel = (idBase: string, id: string) => `${idBase}-panel-${id}`

interface Props<T extends string> {
  pestanas: Pestana<T>[]
  activa: T
  onCambiar: (id: T) => void
  /** Nombre accesible de la lista, p. ej. «Secciones de administración». */
  etiqueta: string
  /** Prefijo de los id de pestañas y paneles; único en la página. */
  idBase: string
}

export default function Pestanas<T extends string>({
  pestanas,
  activa,
  onCambiar,
  etiqueta,
  idBase,
}: Props<T>) {
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  // Si la activa no está en la lista (se ocultó por permisos), Tab entra en
  // la primera
  const iActiva = Math.max(0, pestanas.findIndex((p) => p.id === activa))

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    // Alt+Flecha es «Atrás» en Windows; Ctrl/Cmd+Inicio/Fin, del navegador
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const j = indiceSiguiente(i, pestanas.length, e.key)
    if (j === null) return
    e.preventDefault()
    botones.current[j]?.focus()
    if (pestanas[j].id !== activa) onCambiar(pestanas[j].id)
  }

  return (
    <div className="tabs" role="tablist" aria-label={etiqueta}>
      {pestanas.map((p, i) => {
        const esActiva = p.id === activa
        const iniciaGrupo = i > 0 && !!p.grupo && p.grupo !== pestanas[i - 1].grupo
        return (
          <button
            key={p.id}
            ref={(el) => {
              botones.current[i] = el
            }}
            type="button"
            role="tab"
            id={idTab(idBase, p.id)}
            aria-selected={esActiva}
            // Solo la activa apunta a su panel: es el único que existe
            aria-controls={esActiva ? idPanel(idBase, p.id) : undefined}
            tabIndex={i === iActiva ? 0 : -1}
            className={`tab${esActiva ? ' tab-active' : ''}${iniciaGrupo ? ' tab-grupo-inicio' : ''}`}
            onClick={() => onCambiar(p.id)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

/** Contenido de la pestaña `id`; se renderiza solo el de la activa. */
export function PanelPestana({
  idBase,
  id,
  className,
  children,
}: {
  idBase: string
  id: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={idPanel(idBase, id)}
      aria-labelledby={idTab(idBase, id)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}
