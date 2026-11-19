import { useRef, useState } from 'react'
import Dialogo from '../../../components/Dialogo'
import { escribirCsv, leerCsv } from '../../crm/lib/csv'
import { descargar } from '../../crm/paginas/Exportar'
import { partirRuta } from '../lib/categorias'
import { textoConversion } from '../lib/conversiones'
import { crearRuta, importarLote, leerCatalogos, traducirError } from '../lib/datos'
import { plantilla } from '../lib/exportador'
import {
  combinar,
  contar,
  filasReporte,
  lotes,
  lotesParaEnviar,
  mapear,
  TAMANO_LOTE,
  type FilaMapeada,
  type FilaResultado,
  type FilaRpc,
  type Mapeo,
} from '../lib/importador'
import type { SeparadorDecimal } from '../lib/numeros'
import type { Catalogos } from '../lib/tipos'

// Importar productos desde un CSV (docs/modulos/productos.md, 5.5): archivo,
// vista previa con simulacro en la base lote a lote (no escribe ni gasta
// números), escritura con avance y Detener entre lotes, y reporte. Las
// mismas fases y piezas de CSV que el importador del CRM.

export type Fase =
  | { fase: 'archivo'; error: string | null; leyendo: boolean }
  | { fase: 'simulando'; hechas: number; total: number }
  | { fase: 'vista'; mapeo: Mapeo; previa: FilaResultado[] }
  | { fase: 'escribiendo'; mapeo: Mapeo; previa: FilaResultado[]; hechas: number; total: number }
  | { fase: 'fin'; mapeo: Mapeo; previa: FilaResultado[]; final: FilaResultado[]; cancelada: boolean }

type VistaProps = {
  estado: Fase
  separador: SeparadorDecimal
  catalogos: Catalogos
  creando: boolean
  alSeparador: (s: SeparadorDecimal) => void
  alArchivo: (f: File) => void
  alPlantilla: () => void
  alCrearCategorias: () => void
  alEscribir: () => void
  alCancelar: () => void
  alReporte: () => void
  alCerrar: () => void
}

function Detalle({ titulo, lineas }: { titulo: string; lineas: string[] }) {
  if (lineas.length === 0) return null
  return (
    <details>
      <summary>
        {titulo} ({lineas.length})
      </summary>
      <ul className="prod-lista">
        {lineas.slice(0, 200).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </details>
  )
}

export function ImportarVista(p: VistaProps) {
  const { estado } = p
  if (estado.fase === 'archivo') {
    return (
      <>
        <div className="prod-form">
          <label>
            <span>Separador decimal</span>
            <select value={p.separador} onChange={(e) => p.alSeparador(e.target.value as SeparadorDecimal)}>
              <option value=",">Coma (1.250,5)</option>
              <option value=".">Punto (1,250.5)</option>
            </select>
          </label>
          <label>
            <span>Archivo CSV</span>
            <input type="file" accept=".csv,text/csv" disabled={estado.leyendo} onChange={(e) => e.target.files?.[0] && p.alArchivo(e.target.files[0])} />
          </label>
        </div>
        {estado.error && (
          <p className="error" role="alert">
            {estado.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={p.alPlantilla}>
            Descargar plantilla
          </button>
          <button type="button" className="btn-ghost" onClick={p.alCerrar}>
            Cancelar
          </button>
        </div>
      </>
    )
  }
  if (estado.fase === 'simulando') {
    return (
      <>
        <p role="status">
          Revisando {estado.hechas} de {estado.total}…
        </p>
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={p.alCerrar}>
            Cancelar
          </button>
        </div>
      </>
    )
  }

  const { mapeo, previa } = estado
  const c = contar(previa)
  const errores = previa.filter((f) => f.accion === 'error').map((f) => `Fila ${f.fila}: ${f.errores.join('; ')}`)
  const codigos = mapeo.filas
    .filter((f) => f.codigoOriginal !== null && f.codigo !== null && f.codigoOriginal.trim() !== f.codigo)
    .map((f) => `Fila ${f.fila}: ${f.codigoOriginal!.trim()} → ${f.codigo}`)
  const conversiones = mapeo.filas
    .filter((f): f is FilaMapeada & { conversiones: NonNullable<FilaMapeada['conversiones']> } => f.conversiones !== null && f.conversiones.length > 0)
    .map((f) => `Fila ${f.fila}: ${f.conversiones.map((x) => textoConversion(x.unidad, x.factor, f.unidadBase ?? 'unidad base', p.catalogos.unidades)).join(' · ')}`)
  const escribir = c.crear + c.actualizar
  let resumenFin: string | null = null
  if (estado.fase === 'fin') {
    const fin = new Map(estado.final.map((f) => [f.fila, f]))
    const escritas = estado.final.filter((f) => f.accion === 'crear' || f.accion === 'actualizar').length
    const conError = estado.final.filter((f) => f.accion === 'error').length
    const pendientes = previa.filter((f) => (f.accion === 'crear' || f.accion === 'actualizar') && !fin.has(f.fila)).length
    resumenFin = `${estado.cancelada ? 'Importación detenida. ' : 'Importación terminada. '}Escritas: ${escritas}; con error al escribir: ${conError}${pendientes > 0 ? `; sin escribir: ${pendientes}` : ''}.`
  }

  return (
    <>
      <ul className="prod-lista">
        <li>Crear: {c.crear}</li>
        <li>Actualizar: {c.actualizar}</li>
        <li>Sin cambio: {c.sin_cambio}</li>
        <li>Con error: {c.error}</li>
        {mapeo.omitidas > 0 && <li>Filas de ejemplo omitidas: {mapeo.omitidas}</li>}
      </ul>
      {estado.fase === 'vista' && mapeo.categoriasNuevas.length > 0 && (
        <div className="prod-form">
          <Detalle titulo="Categorías que no existen" lineas={mapeo.categoriasNuevas} />
          <div>
            <button type="button" className="btn-ghost" disabled={p.creando} onClick={p.alCrearCategorias}>
              {p.creando ? 'Creando…' : 'Crear estas categorías'}
            </button>
          </div>
        </div>
      )}
      <Detalle titulo="Errores por fila" lineas={errores} />
      <Detalle titulo="Códigos que cambian al guardarse" lineas={codigos} />
      <Detalle titulo="Unidades alternas" lineas={conversiones} />
      {estado.fase === 'escribiendo' && (
        <p role="status">
          Escribiendo {estado.hechas} de {estado.total}…
        </p>
      )}
      {resumenFin && <p role="status">{resumenFin}</p>}
      <div className="form-actions">
        {estado.fase === 'vista' && (
          <>
            <button type="button" className="btn-ghost" onClick={p.alCerrar}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={escribir === 0 || p.creando} onClick={p.alEscribir}>
              Importar {escribir} productos
            </button>
          </>
        )}
        {estado.fase === 'escribiendo' && (
          <button type="button" className="btn-ghost" onClick={p.alCancelar}>
            Detener
          </button>
        )}
        {estado.fase === 'fin' && (
          <>
            <button type="button" className="btn-ghost" onClick={p.alReporte}>
              Descargar reporte
            </button>
            <button type="button" className="btn-primary" onClick={p.alCerrar}>
              Cerrar
            </button>
          </>
        )}
      </div>
    </>
  )
}

/** Envía los lotes uno a uno; un lote que falla entero deja sus filas con el error. */
async function enviarLotes(
  grupos: FilaRpc[][],
  simular: boolean,
  avance: (hechas: number) => void,
  cancelado: () => boolean,
): Promise<FilaResultado[]> {
  const salida: FilaResultado[] = []
  let hechas = 0
  for (const lote of grupos) {
    if (cancelado()) break
    try {
      salida.push(...(await importarLote(lote, simular)))
    } catch (e) {
      const msg = traducirError(e, { entidad: 'producto' })
      for (const f of lote) salida.push({ fila: f.fila, accion: 'error', codigo: f.codigo ?? null, errores: [msg] })
    }
    hechas += lote.length
    avance(hechas)
  }
  return salida
}

export default function Importar({
  catalogos,
  moneda,
  alCambiarCatalogos,
  onClose,
}: {
  catalogos: Catalogos
  moneda: string
  alCambiarCatalogos: () => void
  onClose: () => void
}) {
  const [estado, setEstado] = useState<Fase>({ fase: 'archivo', error: null, leyendo: false })
  const [separador, setSeparador] = useState<SeparadorDecimal>(',')
  const [creando, setCreando] = useState(false)
  const filasCsv = useRef<string[][]>([])
  const cats = useRef(catalogos)
  const cancelar = useRef(false)

  async function revisar(filas: string[][], c: Catalogos) {
    const mapeo = mapear({ filas, catalogos: c, separador, moneda })
    if (mapeo.error) {
      setEstado({ fase: 'archivo', error: mapeo.error, leyendo: false })
      return
    }
    const grupos = lotesParaEnviar(mapeo.filas)
    const total = grupos.reduce((n, g) => n + g.length, 0)
    cancelar.current = false
    setEstado({ fase: 'simulando', hechas: 0, total })
    const base = await enviarLotes(grupos, true, (hechas) => setEstado({ fase: 'simulando', hechas, total }), () => cancelar.current)
    if (cancelar.current) return
    setEstado({ fase: 'vista', mapeo, previa: combinar(mapeo.filas, base) })
  }

  async function leer(archivo: File) {
    setEstado({ fase: 'archivo', error: null, leyendo: true })
    try {
      filasCsv.current = leerCsv(await archivo.text())
      await revisar(filasCsv.current, cats.current)
    } catch (e) {
      setEstado({ fase: 'archivo', error: traducirError(e), leyendo: false })
    }
  }

  async function crearCategorias() {
    if (estado.fase !== 'vista') return
    setCreando(true)
    try {
      let c = cats.current
      for (const r of estado.mapeo.categoriasNuevas) {
        await crearRuta(partirRuta(r), c.categorias)
        c = await leerCatalogos()
      }
      cats.current = c
      alCambiarCatalogos()
      await revisar(filasCsv.current, c)
    } catch (e) {
      setEstado({ fase: 'archivo', error: traducirError(e, { entidad: 'categoria' }), leyendo: false })
    } finally {
      setCreando(false)
    }
  }

  async function escribir() {
    if (estado.fase !== 'vista') return
    const { mapeo, previa } = estado
    const enviar = new Set(previa.filter((f) => f.accion === 'crear' || f.accion === 'actualizar').map((f) => f.fila))
    const grupos = lotes(
      mapeo.filas.filter((f) => enviar.has(f.fila)).map((f) => f.datos),
      TAMANO_LOTE,
    )
    const total = enviar.size
    cancelar.current = false
    setEstado({ fase: 'escribiendo', mapeo, previa, hechas: 0, total })
    const final = await enviarLotes(grupos, false, (hechas) => setEstado({ fase: 'escribiendo', mapeo, previa, hechas, total }), () => cancelar.current)
    setEstado({ fase: 'fin', mapeo, previa, final, cancelada: cancelar.current })
  }

  const ocupado = estado.fase === 'simulando' || estado.fase === 'escribiendo'
  return (
    <Dialogo
      titulo="Importar productos"
      onClose={() => {
        cancelar.current = true
        onClose()
      }}
      cerrarAlFondo={!ocupado}
      sucio={() => estado.fase === 'vista' || ocupado}
      className="modal-ancho"
    >
      <ImportarVista
        estado={estado}
        separador={separador}
        catalogos={cats.current}
        creando={creando}
        alSeparador={setSeparador}
        alArchivo={leer}
        alPlantilla={() => descargar('plantilla-productos.csv', escribirCsv(plantilla(cats.current, moneda)))}
        alCrearCategorias={crearCategorias}
        alEscribir={escribir}
        alCancelar={() => {
          cancelar.current = true
        }}
        alReporte={() => {
          if (estado.fase === 'fin') descargar('reporte-importacion-productos.csv', escribirCsv(filasReporte(estado.mapeo.filas, estado.previa, estado.final)))
        }}
        alCerrar={() => {
          cancelar.current = true
          onClose()
        }}
      />
    </Dialogo>
  )
}
