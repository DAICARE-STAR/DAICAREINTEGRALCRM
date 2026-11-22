import { useEffect, useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import CabeceraAdmin from '../../../pages/admin/CabeceraAdmin'
import '../productos.css'
import { archivarClase, guardarClase, leerCatalogos, predeterminarClase, traducirError } from '../lib/datos'
import { aTextoComa, fmtCantidad, leerDecimal } from '../lib/numeros'
import { TIPOS_IMPUESTO, TRATAMIENTOS, type ClaseImpuesto, type TipoImpuesto, type Tratamiento } from '../lib/tipos'
import { validarClase, type FormClase } from '../lib/validacion'

// Administración → Productos (solo administrador): clases de impuesto. La
// clave, el tipo y el tratamiento no cambian tras el alta; el porcentaje sí
// (las líneas lo copian al crearse). Siempre hay una predeterminada activa.

const etiqueta = (lista: { valor: string; label: string }[], v: string) => lista.find((x) => x.valor === v)?.label ?? v

export function ImpuestosVista({
  clases,
  error,
  alNueva,
  alEditar,
  alPredeterminar,
  alArchivar,
}: {
  clases: ClaseImpuesto[] | null
  error: string | null
  alNueva: () => void
  alEditar: (c: ClaseImpuesto) => void
  alPredeterminar: (c: ClaseImpuesto) => void
  alArchivar: (c: ClaseImpuesto) => void
}) {
  return (
    <section>
      <CabeceraAdmin titulo="Inventario: clases de impuesto">
        <button type="button" className="btn-primary" onClick={alNueva}>
          Nueva clase
        </button>
      </CabeceraAdmin>
      {error ? (
        <EstadoVacio causa={error} />
      ) : clases === null ? (
        <SkeletonLineas n={4} />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Clave</th>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col">Tratamiento</th>
                <th scope="col" className="prod-num">
                  Porcentaje
                </th>
                <th scope="col">Predeterminada</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clases.map((c) => (
                <tr key={c.clave} className={c.archivado_en ? 'row-inactive' : undefined}>
                  <td className="prod-codigo">{c.clave}</td>
                  <td>
                    {c.nombre}
                    {c.archivado_en && <span className="muted"> · archivada</span>}
                  </td>
                  <td>{etiqueta(TIPOS_IMPUESTO, c.tipo)}</td>
                  <td>{etiqueta(TRATAMIENTOS, c.tratamiento)}</td>
                  <td className="prod-num">{fmtCantidad(c.porcentaje)} %</td>
                  <td>{c.predeterminado ? 'Sí' : '—'}</td>
                  <td>
                    <span className="prod-acciones">
                      {!c.archivado_en && (
                        <button type="button" className="btn-ghost btn-small" onClick={() => alEditar(c)}>
                          Editar
                        </button>
                      )}
                      {!c.archivado_en && !c.predeterminado && (
                        <button type="button" className="btn-ghost btn-small" onClick={() => alPredeterminar(c)}>
                          Marcar como predeterminada
                        </button>
                      )}
                      {!c.predeterminado && (
                        <button type="button" className="btn-ghost btn-small" onClick={() => alArchivar(c)}>
                          {c.archivado_en ? 'Restaurar' : 'Archivar'}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FormClaseDialogo({ clase, onClose, onGuardada }: { clase: ClaseImpuesto | null; onClose: () => void; onGuardada: () => void }) {
  const [f, setF] = useState<FormClase>({
    clave: clase?.clave ?? '',
    nombre: clase?.nombre ?? '',
    tipo: clase?.tipo ?? 'iva',
    tratamiento: clase?.tratamiento ?? 'gravado',
    porcentaje: aTextoComa(clase?.porcentaje ?? 0),
  })
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const set = <K extends keyof FormClase>(k: K, v: FormClase[K]) => setF((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const porcentaje = f.tratamiento === 'gravado' ? f.porcentaje : '0'
    const errs = validarClase({ ...f, porcentaje })
    setErrores(errs)
    if (errs.length > 0) return
    setGuardando(true)
    try {
      await guardarClase(!clase, { clave: f.clave, nombre: f.nombre.trim(), tipo: f.tipo, tratamiento: f.tratamiento, porcentaje: leerDecimal(porcentaje || '0', ',') ?? '0' })
      onGuardada()
    } catch (err) {
      setErrores([traducirError(err, { entidad: 'impuesto' })])
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={clase ? 'Editar clase de impuesto' : 'Nueva clase de impuesto'} onClose={onClose} onSubmit={enviar} focoInicial={clase ? ref : undefined}>
      <div className="prod-form">
        <label>
          <span>Clave *</span>
          <input autoComplete="off" required maxLength={30} disabled={!!clase} placeholder="iva_general" value={f.clave} onChange={(e) => set('clave', e.target.value.toLowerCase())} />
        </label>
        <label>
          <span>Nombre *</span>
          <input autoComplete="off" ref={ref} required maxLength={60} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label>
          <span>Tipo</span>
          <select value={f.tipo} disabled={!!clase} onChange={(e) => set('tipo', e.target.value as TipoImpuesto)}>
            {TIPOS_IMPUESTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Tratamiento</span>
          <select value={f.tratamiento} disabled={!!clase} onChange={(e) => set('tratamiento', e.target.value as Tratamiento)}>
            {TRATAMIENTOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Porcentaje</span>
          <input autoComplete="off" inputMode="decimal" maxLength={10} disabled={f.tratamiento !== 'gravado'} value={f.tratamiento === 'gravado' ? f.porcentaje : '0'} onChange={(e) => set('porcentaje', e.target.value)} />
        </label>
        {errores.length > 0 && (
          <ul className="error" role="alert">
            {errores.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Dialogo>
  )
}

export default function ImpuestosProductos() {
  const avisar = useAvisos()
  const [clases, setClases] = useState<ClaseImpuesto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<ClaseImpuesto | 'nueva' | null>(null)
  const recargar = () =>
    leerCatalogos().then(
      (c) => setClases(c.impuestos),
      (e) => setError(traducirError(e)),
    )

  useEffect(() => {
    void recargar()
  }, [])

  const accion = (p: Promise<void>, ok: string) =>
    p.then(
      () => {
        avisar(ok)
        void recargar()
      },
      (e) => avisar(traducirError(e, { entidad: 'impuesto' }), 'error'),
    )

  return (
    <>
      <ImpuestosVista
        clases={clases}
        error={error}
        alNueva={() => setEditando('nueva')}
        alEditar={setEditando}
        alPredeterminar={(c) => accion(predeterminarClase(c.clave), 'Clase predeterminada cambiada')}
        alArchivar={(c) => accion(archivarClase(c.clave, !c.archivado_en), c.archivado_en ? 'Clase restaurada' : 'Clase archivada')}
      />
      {editando && (
        <FormClaseDialogo
          clase={editando === 'nueva' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null)
            avisar('Clase guardada')
            void recargar()
          }}
        />
      )}
    </>
  )
}
