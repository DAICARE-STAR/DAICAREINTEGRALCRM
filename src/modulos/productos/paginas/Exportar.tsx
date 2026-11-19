import { useState } from 'react'
import Dialogo from '../../../components/Dialogo'
import { escribirCsv } from '../../crm/lib/csv'
import { descargar } from '../../crm/paginas/Exportar'
import { ruta } from '../lib/categorias'
import { DemasiadosParaExportar, productosParaExportar, traducirError } from '../lib/datos'
import { exportarProductos, plantilla, TOPE_EXPORTAR } from '../lib/exportador'
import { filtrosActivos, type FiltrosProductos } from '../lib/filtros'
import { nombreTipo, type Catalogos } from '../lib/tipos'

const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

/** Resumen legible de los filtros activos. */
export function resumenFiltros(f: FiltrosProductos, c: Catalogos): string[] {
  const s: string[] = []
  if (f.q.trim()) s.push(`Búsqueda: ${f.q.trim()}`)
  if (f.categoria) s.push(`Categoría: ${ruta(c.categorias, f.categoria) || '—'}`)
  if (f.tipo) s.push(`Tipo: ${nombreTipo(f.tipo)}`)
  if (f.uso) s.push(f.uso === 'venta' ? 'Se vende' : 'Se compra')
  if (f.archivados) s.push('Con archivados')
  return s
}

// Exporta la lista filtrada en un CSV reimportable: el navegador recorre
// productos_buscar de 200 en 200 con el permiso de lectura (exportar no es
// un permiso aparte, decisión técnica 10 del diseño).
export default function Exportar({
  filtros,
  total,
  catalogos,
  moneda,
  onClose,
}: {
  filtros: FiltrosProductos
  total: number
  catalogos: Catalogos
  moneda: string
  onClose: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resumen = resumenFiltros(filtros, catalogos)

  async function exportar() {
    setOcupado(true)
    setError(null)
    try {
      const { productos, conversiones } = await productosParaExportar(filtros)
      descargar(`productos-${hoy()}.csv`, escribirCsv(exportarProductos(productos, conversiones, catalogos)))
      onClose()
    } catch (e) {
      setError(
        e instanceof DemasiadosParaExportar
          ? `Hay más de ${TOPE_EXPORTAR.toLocaleString('es-CO')} productos con estos filtros. Filtra la lista y exporta por partes.`
          : traducirError(e),
      )
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialogo titulo="Exportar productos" onClose={onClose}>
      <p>{total.toLocaleString('es-CO')} productos con los filtros actuales.</p>
      {filtrosActivos(filtros) > 0 && (
        <ul className="prod-lista small">
          {resumen.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={() => descargar('plantilla-productos.csv', escribirCsv(plantilla(catalogos, moneda)))}>
          Descargar plantilla
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={ocupado || total === 0} onClick={exportar} data-foco>
          {ocupado ? 'Exportando…' : 'Descargar CSV'}
        </button>
      </div>
    </Dialogo>
  )
}
