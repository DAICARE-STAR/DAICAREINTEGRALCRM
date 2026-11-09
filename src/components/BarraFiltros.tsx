import { contarActivos, etiquetaMas, repartir, textoContador } from '../lib/filtros'

// Barra de filtros de las vistas de módulo (filterbar de team-portal): buscador
// opcional, selects con su opción neutra, cinco visibles como máximo y el resto
// en «Más filtros» (abierto al montar si alguno de dentro está activo), el
// contador de activos y Limpiar. Cada select se nombra con su etiqueta.

export interface FiltroSelect {
  id: string
  etiqueta: string
  /** La primera es la neutra («Estado: todos») con el valor por defecto. */
  opciones: { valor: string; label: string }[]
  valor: string
  def?: string
}

interface Props {
  filtros: FiltroSelect[]
  alCambiar: (id: string, valor: string) => void
  alLimpiar: () => void
  buscador?: { valor: string; etiqueta: string; alCambiar: (v: string) => void }
}

const aControl = (f: FiltroSelect) => ({ id: f.id, valor: f.valor, def: f.def ?? '' })

export default function BarraFiltros({ filtros, alCambiar, alLimpiar, buscador }: Props) {
  const { visibles, mas } = repartir(filtros)
  const n = contarActivos(filtros.map(aControl)) + (buscador && buscador.valor !== '' ? 1 : 0)
  const activosMas = contarActivos(mas.map(aControl))

  const select = (f: FiltroSelect) => (
    <select key={f.id} id={f.id} aria-label={f.etiqueta} value={f.valor} onChange={(e) => alCambiar(f.id, e.target.value)}>
      {f.opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.label}
        </option>
      ))}
    </select>
  )

  return (
    <div className={`fbar${n > 0 ? ' has-filters' : ''}`} role="search">
      {buscador && (
        <input
          type="search"
          aria-label={buscador.etiqueta}
          placeholder={buscador.etiqueta}
          value={buscador.valor}
          onChange={(e) => buscador.alCambiar(e.target.value)}
        />
      )}
      {visibles.map(select)}
      {mas.length > 0 && (
        <details className="fbar-mas" open={activosMas > 0 || undefined}>
          <summary>{etiquetaMas(activosMas)}</summary>
          <div className="fbar-mas-cuerpo">{mas.map(select)}</div>
        </details>
      )}
      <span className="fbar-count" aria-live="polite">
        {textoContador(n)}
      </span>
      <button type="button" className="btn-ghost fbar-clear" onClick={alLimpiar} disabled={n === 0}>
        Limpiar
      </button>
    </div>
  )
}
