import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import CabeceraPagina from '../../../components/CabeceraPagina'
import Dialogo from '../../../components/Dialogo'
import EstadoVacio from '../../../components/EstadoVacio'
import Pestanas, { PanelPestana } from '../../../components/Pestanas'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { aplanar, NIVELES_MAX, opcionesArbol, padresPosibles } from '../lib/categorias'
import { archivarCategoria, archivarUnidad, guardarCategoria, guardarUnidad, traducirError } from '../lib/datos'
import type { Catalogos as TCatalogos, Categoria, Unidad } from '../lib/tipos'
import { validarNombreCategoria, validarUnidad, type FormUnidad } from '../lib/validacion'
import { useCatalogos } from './useCatalogos'

// /productos/catalogos: categorías en árbol (hasta tres niveles) y unidades.
// Ver exige app_productos; crear, editar y archivar, edit_productos. Lo que
// niega la base (ciclo, profundidad, hijas activas, unidad del sistema) sale
// con su mensaje.

type Pestana = 'categorias' | 'unidades'
const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'categorias', label: 'Categorías' },
  { id: 'unidades', label: 'Unidades' },
]
const ID_BASE = 'prod-catalogos'

type VistaProps = {
  catalogos: TCatalogos
  cargados: boolean
  error: string | null
  activa: Pestana
  puedeEditar: boolean
  alCambiar: (p: Pestana) => void
  alNuevaCategoria: (padre: Categoria | null) => void
  alEditarCategoria: (c: Categoria) => void
  alArchivarCategoria: (c: Categoria) => void
  alNuevaUnidad: () => void
  alEditarUnidad: (u: Unidad) => void
  alArchivarUnidad: (u: Unidad) => void
}

export function CatalogosVista(p: VistaProps) {
  const nodos = aplanar(p.catalogos.categorias)
  const unidades = [...p.catalogos.unidades].sort((a, b) => Number(!!a.archivado_en) - Number(!!b.archivado_en) || a.nombre.localeCompare(b.nombre, 'es'))
  let cuerpo
  if (p.error) cuerpo = <EstadoVacio causa={p.error} />
  else if (!p.cargados) cuerpo = <SkeletonLineas n={6} />
  else if (p.activa === 'categorias')
    cuerpo =
      nodos.length === 0 ? (
        <EstadoVacio causa="Todavía no hay categorías." />
      ) : (
        <ul className="prod-lista">
          {nodos.map(({ categoria: c, nivel }) => (
            <li key={c.id} className={`prod-fila${nivel > 1 ? ` prod-sangria-${Math.min(nivel, 3)}` : ''}${c.archivado_en ? ' row-inactive' : ''}`}>
              <span>
                {c.nombre}
                {c.archivado_en && <span className="muted"> · archivada</span>}
              </span>
              {p.puedeEditar && (
                <span className="prod-acciones">
                  {nivel < NIVELES_MAX && !c.archivado_en && (
                    <button type="button" className="btn-ghost btn-small" onClick={() => p.alNuevaCategoria(c)}>
                      Nueva subcategoría
                    </button>
                  )}
                  {!c.archivado_en && (
                    <button type="button" className="btn-ghost btn-small" onClick={() => p.alEditarCategoria(c)}>
                      Editar
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-small" onClick={() => p.alArchivarCategoria(c)}>
                    {c.archivado_en ? 'Restaurar' : 'Archivar'}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )
  else
    cuerpo = (
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Clave</th>
              <th scope="col">Nombre</th>
              <th scope="col">Símbolo</th>
              <th scope="col" className="prod-num">
                Decimales
              </th>
              {p.puedeEditar && <th scope="col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.clave} className={u.archivado_en ? 'row-inactive' : undefined}>
                <td className="prod-codigo">{u.clave}</td>
                <td>
                  {u.nombre}
                  {u.archivado_en && <span className="muted"> · archivada</span>}
                </td>
                <td>{u.simbolo ?? '—'}</td>
                <td className="prod-num">{u.decimales}</td>
                {p.puedeEditar && (
                  <td>
                    <span className="prod-acciones">
                      {!u.archivado_en && (
                        <button type="button" className="btn-ghost btn-small" onClick={() => p.alEditarUnidad(u)}>
                          Editar
                        </button>
                      )}
                      {!u.sistema && (
                        <button type="button" className="btn-ghost btn-small" onClick={() => p.alArchivarUnidad(u)}>
                          {u.archivado_en ? 'Restaurar' : 'Archivar'}
                        </button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <div className="page page-productos">
      <CabeceraPagina
        titulo="Catálogos de productos"
        pestanas={<Pestanas pestanas={PESTANAS} activa={p.activa} onCambiar={p.alCambiar} etiqueta="Catálogos" idBase={ID_BASE} />}
      >
        <Link to="/productos" className="btn-ghost">
          Productos
        </Link>
        {p.puedeEditar &&
          (p.activa === 'categorias' ? (
            <button type="button" className="btn-primary" onClick={() => p.alNuevaCategoria(null)}>
              Nueva categoría
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={p.alNuevaUnidad}>
              Nueva unidad
            </button>
          ))}
      </CabeceraPagina>
      <PanelPestana idBase={ID_BASE} id={p.activa}>
        {cuerpo}
      </PanelPestana>
    </div>
  )
}

function FormCategoria({
  categoria,
  padre,
  lista,
  onClose,
  onGuardada,
}: {
  categoria: Categoria | null
  padre: Categoria | null
  lista: Categoria[]
  onClose: () => void
  onGuardada: () => void
}) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [padreId, setPadreId] = useState(categoria ? categoria.padre_id ?? '' : padre?.id ?? '')
  const [orden, setOrden] = useState(String(categoria?.orden ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const opciones = opcionesArbol(padresPosibles(lista, categoria?.id ?? null))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const motivo = validarNombreCategoria(nombre)
    if (motivo) {
      setError(motivo)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await guardarCategoria(categoria?.id ?? null, { nombre: nombre.trim(), padre_id: padreId || null, orden: Math.trunc(Number(orden)) || 0 })
      onGuardada()
    } catch (err) {
      setError(traducirError(err, { entidad: 'categoria' }))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={categoria ? 'Editar categoría' : padre ? 'Nueva subcategoría' : 'Nueva categoría'} onClose={onClose} onSubmit={enviar} focoInicial={ref}>
      <div className="prod-form">
        <label>
          <span>Nombre *</span>
          <input autoComplete="off" ref={ref} required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          <span>Dentro de</span>
          <select value={padreId} onChange={(e) => setPadreId(e.target.value)}>
            <option value="">Ninguna (primer nivel)</option>
            {opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Orden</span>
          <input autoComplete="off" type="number" step={1} value={orden} onChange={(e) => setOrden(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
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

function FormUnidadDialogo({ unidad, onClose, onGuardada }: { unidad: Unidad | null; onClose: () => void; onGuardada: () => void }) {
  const [f, setF] = useState<FormUnidad>({
    clave: unidad?.clave ?? '',
    nombre: unidad?.nombre ?? '',
    simbolo: unidad?.simbolo ?? '',
    decimales: String(unidad?.decimales ?? 0),
  })
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof FormUnidad, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const errs = validarUnidad(f)
    setErrores(errs)
    if (errs.length > 0) return
    setGuardando(true)
    try {
      await guardarUnidad(!unidad, { clave: f.clave, nombre: f.nombre.trim(), simbolo: f.simbolo.trim() || null, decimales: Number(f.decimales) })
      onGuardada()
    } catch (err) {
      setErrores([traducirError(err, { entidad: 'unidad' })])
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={unidad ? 'Editar unidad' : 'Nueva unidad'} onClose={onClose} onSubmit={enviar}>
      <div className="prod-form">
        <label>
          <span>Clave *</span>
          <input autoComplete="off" required maxLength={20} disabled={!!unidad} placeholder="caja" value={f.clave} onChange={(e) => set('clave', e.target.value.toLowerCase())} />
        </label>
        <label>
          <span>Nombre *</span>
          <input autoComplete="off" required maxLength={40} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label>
          <span>Símbolo</span>
          <input autoComplete="off" maxLength={10} value={f.simbolo} onChange={(e) => set('simbolo', e.target.value)} />
        </label>
        <label>
          <span>Decimales admitidos</span>
          <input autoComplete="off" type="number" min={0} max={6} step={1} value={f.decimales} onChange={(e) => set('decimales', e.target.value)} />
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

export default function Catalogos() {
  const { hasPerm } = useAuth()
  const avisar = useAvisos()
  const { catalogos, cargados, error, recargar } = useCatalogos()
  const [activa, setActiva] = useState<Pestana>('categorias')
  const [categoria, setCategoria] = useState<{ categoria: Categoria | null; padre: Categoria | null } | null>(null)
  const [unidad, setUnidad] = useState<Unidad | 'nueva' | null>(null)
  const puedeEditar = hasPerm('edit_productos')

  const hecho = (msg: string) => () => {
    avisar(msg)
    void recargar()
  }

  return (
    <>
      <CatalogosVista
        catalogos={catalogos}
        cargados={cargados}
        error={error}
        activa={activa}
        puedeEditar={puedeEditar}
        alCambiar={setActiva}
        alNuevaCategoria={(padre) => setCategoria({ categoria: null, padre })}
        alEditarCategoria={(c) => setCategoria({ categoria: c, padre: null })}
        alArchivarCategoria={(c) =>
          archivarCategoria(c.id, !c.archivado_en).then(hecho(c.archivado_en ? 'Categoría restaurada' : 'Categoría archivada'), (e) =>
            avisar(traducirError(e, { entidad: 'categoria' }), 'error'),
          )
        }
        alNuevaUnidad={() => setUnidad('nueva')}
        alEditarUnidad={setUnidad}
        alArchivarUnidad={(u) =>
          archivarUnidad(u.clave, !u.archivado_en).then(hecho(u.archivado_en ? 'Unidad restaurada' : 'Unidad archivada'), (e) =>
            avisar(traducirError(e, { entidad: 'unidad' }), 'error'),
          )
        }
      />
      {categoria && puedeEditar && (
        <FormCategoria
          categoria={categoria.categoria}
          padre={categoria.padre}
          lista={catalogos.categorias}
          onClose={() => setCategoria(null)}
          onGuardada={() => {
            setCategoria(null)
            hecho('Categoría guardada')()
          }}
        />
      )}
      {unidad && puedeEditar && (
        <FormUnidadDialogo
          unidad={unidad === 'nueva' ? null : unidad}
          onClose={() => setUnidad(null)}
          onGuardada={() => {
            setUnidad(null)
            hecho('Unidad guardada')()
          }}
        />
      )}
    </>
  )
}
