import { useState } from 'react'
import Dialogo from '../../../components/Dialogo'
import { escribirCsv } from '../lib/csv'
import { registrarExportacion, todasLasCuentas, traducirError, type Responsable } from '../lib/datos'
import { exportarCuentas, plantilla } from '../lib/exportador'
import type { FiltrosCrm } from '../lib/filtros'
import type { AjustesCrm, CampoDef } from '../lib/tipos'

export function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

// Exporta la lista filtrada (nunca datos de salud: crm_buscar no los trae)
export default function Exportar({
  filtros,
  total,
  ajustes,
  defs,
  responsables,
  onClose,
}: {
  filtros: FiltrosCrm
  total: number
  ajustes: AjustesCrm
  defs: CampoDef[]
  responsables: Responsable[]
  onClose: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportar() {
    setOcupado(true)
    setError(null)
    try {
      const cuentas = await todasLasCuentas(filtros)
      const nombres = Object.fromEntries(responsables.map((r) => [r.id, r.nombre]))
      descargar(`cuentas-${hoy()}.csv`, escribirCsv(exportarCuentas(cuentas, ajustes, defs, nombres)))
      registrarExportacion(cuentas.length)
      onClose()
    } catch (e) {
      setError(traducirError(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialogo titulo="Exportar cuentas" onClose={onClose}>
      <p>{total.toLocaleString('es-CO')} cuentas con los filtros actuales.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={() => descargar('plantilla-cuentas.csv', escribirCsv(plantilla(ajustes, defs)))}>
          Descargar plantilla
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={ocupado || total === 0} onClick={exportar} data-foco>
          {ocupado ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
    </Dialogo>
  )
}
