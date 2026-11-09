import { useRef, useState } from 'react'
import Dialogo from '../../../components/Dialogo'
import { escribirCsv, leerCsv } from '../lib/csv'
import { actualizarImportada, cuentasParaImportar, insertarLote, registrarImportacion, traducirError, type Responsable } from '../lib/datos'
import { importar, lotes, type FilaImportada, type ResultadoImportacion } from '../lib/importador'
import type { AjustesCrm, CampoDef } from '../lib/tipos'
import { contarImportacion, filasReporte } from '../lib/vistas'
import { descargar } from './Exportar'

const LOTE = 100

export type Fase =
  | { fase: 'archivo'; error: string | null; leyendo: boolean }
  | { fase: 'vista'; resultado: ResultadoImportacion }
  | { fase: 'escribiendo'; resultado: ResultadoImportacion; hechas: number; total: number }
  | { fase: 'fin'; resultado: ResultadoImportacion; escritura: Map<number, string | null>; cancelada: boolean }

type VistaProps = {
  estado: Fase
  alArchivo: (f: File) => void
  alEscribir: () => void
  alCancelar: () => void
  alReporte: () => void
  alCerrar: () => void
}

export function ImportarVista({ estado, alArchivo, alEscribir, alCancelar, alReporte, alCerrar }: VistaProps) {
  if (estado.fase === 'archivo') {
    return (
      <>
        <label className="crm-form">
          <span>Archivo CSV</span>
          <input type="file" accept=".csv,text/csv" disabled={estado.leyendo} onChange={(e) => e.target.files?.[0] && alArchivo(e.target.files[0])} />
        </label>
        {estado.error && (
          <p className="error" role="alert">
            {estado.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </>
    )
  }
  const c = contarImportacion(estado.resultado.filas)
  const errores = estado.resultado.filas.filter((f): f is Extract<FilaImportada, { accion: 'error' }> => f.accion === 'error')
  return (
    <>
      <ul className="crm-lista">
        <li>Crear: {c.crear}</li>
        <li>Actualizar: {c.actualizar}</li>
        <li>Sin cambio: {c.sin_cambio}</li>
        <li>Con error: {c.error}</li>
        {estado.resultado.omitidas > 0 && <li>Filas de ejemplo omitidas: {estado.resultado.omitidas}</li>}
      </ul>
      {errores.length > 0 && (
        <details>
          <summary>Errores por fila ({errores.length})</summary>
          <ul className="crm-lista">
            {errores.slice(0, 200).map((f) => (
              <li key={f.fila}>
                Fila {f.fila}: {f.errores.join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {estado.fase === 'escribiendo' && (
        <p role="status">
          Escribiendo {estado.hechas} de {estado.total}…
        </p>
      )}
      {estado.fase === 'fin' && (
        <p role="status">
          {estado.cancelada ? 'Importación cancelada. ' : 'Importación terminada. '}
          Escritas: {[...estado.escritura.values()].filter((v) => v === null).length}; con error: {[...estado.escritura.values()].filter((v) => v !== null).length}.
        </p>
      )}
      <div className="form-actions">
        {estado.fase === 'vista' && (
          <>
            <button type="button" className="btn-ghost" onClick={alCerrar}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={c.crear + c.actualizar === 0} onClick={alEscribir}>
              Importar {c.crear + c.actualizar} cuentas
            </button>
          </>
        )}
        {estado.fase === 'escribiendo' && (
          <button type="button" className="btn-ghost" onClick={alCancelar}>
            Detener
          </button>
        )}
        {estado.fase === 'fin' && (
          <>
            <button type="button" className="btn-ghost" onClick={alReporte}>
              Descargar reporte
            </button>
            <button type="button" className="btn-primary" onClick={alCerrar}>
              Cerrar
            </button>
          </>
        )}
      </div>
    </>
  )
}

export default function Importar({
  ajustes,
  defs,
  responsables,
  onClose,
}: {
  ajustes: AjustesCrm
  defs: CampoDef[]
  responsables: Responsable[]
  onClose: () => void
}) {
  const [estado, setEstado] = useState<Fase>({ fase: 'archivo', error: null, leyendo: false })
  const cancelar = useRef(false)

  async function leer(archivo: File) {
    setEstado({ fase: 'archivo', error: null, leyendo: true })
    try {
      const filas = leerCsv(await archivo.text())
      const cuentas = await cuentasParaImportar()
      const mapa = Object.fromEntries(responsables.map((r) => [r.nombre, r.id]))
      const resultado = importar({ filas, ajustes, defs, responsables: mapa, cuentas })
      if (resultado.error) setEstado({ fase: 'archivo', error: resultado.error, leyendo: false })
      else setEstado({ fase: 'vista', resultado })
    } catch (e) {
      setEstado({ fase: 'archivo', error: traducirError(e), leyendo: false })
    }
  }

  async function escribir() {
    if (estado.fase !== 'vista') return
    const { resultado } = estado
    const crear = resultado.filas.filter((f): f is Extract<FilaImportada, { accion: 'crear' }> => f.accion === 'crear')
    const actualizar = resultado.filas.filter((f): f is Extract<FilaImportada, { accion: 'actualizar' }> => f.accion === 'actualizar')
    const total = crear.length + actualizar.length
    const escritura = new Map<number, string | null>()
    cancelar.current = false
    let hechas = 0
    setEstado({ fase: 'escribiendo', resultado, hechas, total })
    for (const lote of lotes(crear, LOTE)) {
      if (cancelar.current) break
      try {
        await insertarLote(lote.map((f) => f.datos))
        for (const f of lote) escritura.set(f.fila, null)
      } catch (e) {
        const msg = traducirError(e, { entidad: 'cuenta' })
        for (const f of lote) escritura.set(f.fila, msg)
      }
      hechas += lote.length
      setEstado({ fase: 'escribiendo', resultado, hechas, total })
    }
    for (const lote of lotes(actualizar, LOTE)) {
      if (cancelar.current) break
      await Promise.all(
        lote.map((f) =>
          actualizarImportada(f.id, f.cambios).then(
            () => escritura.set(f.fila, null),
            (e) => escritura.set(f.fila, traducirError(e, { entidad: 'cuenta' })),
          ),
        ),
      )
      hechas += lote.length
      setEstado({ fase: 'escribiendo', resultado, hechas, total })
    }
    const ok = (accion: string) =>
      resultado.filas.filter((f) => f.accion === accion && escritura.get(f.fila) === null).length
    const conError = [...escritura.values()].filter((v) => v !== null).length
    registrarImportacion(ok('crear'), ok('actualizar'), conError + contarImportacion(resultado.filas).error)
    setEstado({ fase: 'fin', resultado, escritura, cancelada: cancelar.current })
  }

  return (
    <Dialogo
      titulo="Importar cuentas"
      onClose={() => {
        cancelar.current = true
        onClose()
      }}
      cerrarAlFondo={estado.fase !== 'escribiendo'}
      sucio={() => estado.fase === 'vista' || estado.fase === 'escribiendo'}
      className="modal-ancho"
    >
      <ImportarVista
        estado={estado}
        alArchivo={leer}
        alEscribir={escribir}
        alCancelar={() => {
          cancelar.current = true
        }}
        alReporte={() => {
          if (estado.fase === 'fin') descargar('reporte-importacion.csv', escribirCsv(filasReporte(estado.resultado.filas, estado.escritura)))
        }}
        alCerrar={() => {
          cancelar.current = true
          onClose()
        }}
      />
    </Dialogo>
  )
}
