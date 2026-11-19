import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import Pestanas, { PanelPestana } from '../../../components/Pestanas'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { ruta } from '../lib/categorias'
import { archivarProducto, borrarProducto, leerConversiones, leerHistorial, leerPersonas, leerProducto, traducirError, type Persona } from '../lib/datos'
import { nombreTipo, type Cambio, type Catalogos, type Conversion, type Producto } from '../lib/tipos'
import { describirCambio, errorIdFicha, errorLecturaFicha, fmtFechaHora, fmtPrecio, nombreUnidad, PESTANAS_FICHA, textoClase, type PestanaFicha } from '../lib/vistas'
import FormProducto from './FormProducto'
import UnidadesProducto from './UnidadesProducto'
import { useCatalogos } from './useCatalogos'

const ID_BASE = 'prod-ficha'

export function DatosProducto({ producto: p, catalogos: c }: { producto: Producto; catalogos: Catalogos }) {
  const unidad = nombreUnidad(c, p.unidad_base)
  const filas: [string, ReactNode][] = [
    ['Código', p.codigo],
    ['Tipo', nombreTipo(p.tipo)],
    ['Se vende', p.vendible ? 'Sí' : 'No'],
    ['Se compra', p.comprable ? 'Sí' : 'No'],
    ['Categoría', p.categoria_id ? ruta(c.categorias, p.categoria_id) : null],
    ['Unidad base', unidad],
    ['Impuesto', textoClase(c.impuestos.find((i) => i.clave === p.impuesto), p.impuesto)],
    [`Precio de lista por ${unidad.toLowerCase()}, sin IVA`, p.precio_lista === null ? null : fmtPrecio(p.precio_lista, p.precio_lista_moneda)],
    ['Descripción', p.descripcion],
    ['Creado', fmtFechaHora(p.created_at)],
    ['Actualizado', fmtFechaHora(p.updated_at)],
  ]
  return (
    <dl className="prod-datos">
      {filas.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HistorialVista({
  lista,
  catalogos,
  moneda,
  personas,
  error,
  errorPersonas,
  hayMas,
  alCargarMas,
}: {
  lista: Cambio[] | null
  catalogos: Catalogos
  moneda: string | null
  personas: Persona[]
  error?: string | null
  errorPersonas?: string | null
  hayMas?: boolean
  alCargarMas?: () => void
}) {
  if (lista === null) return <SkeletonLineas n={4} />
  if (lista.length === 0) return <EstadoVacio causa={error ?? 'Sin cambios registrados.'} />
  return (
    <>
      {(error || errorPersonas) && (
        <p className="error" role="alert">
          {error ?? errorPersonas}
        </p>
      )}
      <ul className="prod-lista">
        {lista.map((c) => (
          <li key={c.id}>
            {describirCambio(c, catalogos, moneda).map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div className="small muted">
              {fmtFechaHora(c.created_at)} · {personas.find((x) => x.id === c.autor_id)?.nombre ?? '—'}
            </div>
          </li>
        ))}
      </ul>
      {hayMas && alCargarMas && (
        <div className="prod-mas">
          <button type="button" className="btn-ghost" onClick={alCargarMas}>
            Cargar más
          </button>
        </div>
      )}
    </>
  )
}

const PAGINA_HISTORIAL = 200

function Historial({ producto, catalogos }: { producto: Producto; catalogos: Catalogos }) {
  const [lista, setLista] = useState<Cambio[] | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null)
  const cargar = (limite: number) =>
    leerHistorial(producto.id, limite).then(
      (r) => {
        setLista(r.lista)
        setHayMas(r.hayMas)
        setError(null)
      },
      (e) => {
        setLista((l) => l ?? [])
        setError(traducirError(e))
      },
    )
  useEffect(() => {
    setLista(null)
    setError(null)
    void cargar(PAGINA_HISTORIAL)
    leerPersonas().then(
      (p) => {
        setPersonas(p)
        setErrorPersonas(null)
      },
      (e) => setErrorPersonas(traducirError(e)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto.id, producto.updated_at])
  return (
    <HistorialVista
      lista={lista}
      catalogos={catalogos}
      moneda={producto.precio_lista_moneda}
      personas={personas}
      error={error}
      errorPersonas={errorPersonas}
      hayMas={hayMas}
      alCargarMas={() => void cargar((lista?.length ?? 0) + PAGINA_HISTORIAL)}
    />
  )
}

type VistaProps = {
  producto: Producto | null
  error?: string | null
  activa: PestanaFicha
  puedeEditar: boolean
  esAdmin: boolean
  // Sin catálogos el formulario no tiene unidades ni impuestos que ofrecer
  sinCatalogos?: boolean
  alCambiar: (p: PestanaFicha) => void
  alEditar: () => void
  alArchivar: () => void
  alBorrar: () => void
  children?: ReactNode
}

export function FichaProductoVista(p: VistaProps) {
  if (!p.producto) {
    return (
      <div className="page page-productos">
        <CabeceraPagina titulo="Producto" />
        {p.error ? (
          <EstadoVacio
            causa={p.error}
            accion={
              <Link to="/productos" className="btn-ghost">
                Volver a productos
              </Link>
            }
          />
        ) : (
          <SkeletonLineas n={6} />
        )}
      </div>
    )
  }
  return (
    <div className="page page-productos">
      <CabeceraPagina
        titulo={`${p.producto.codigo} · ${p.producto.nombre}`}
        sufijo={p.producto.archivado_en ? 'archivado' : null}
        pestanas={<Pestanas pestanas={PESTANAS_FICHA} activa={p.activa} onCambiar={p.alCambiar} etiqueta="Secciones del producto" idBase={ID_BASE} />}
      >
        <Link to="/productos" className="btn-ghost">
          Productos
        </Link>
        {p.puedeEditar && (
          <>
            <button type="button" className="btn-ghost" disabled={p.sinCatalogos} onClick={p.alEditar}>
              Editar
            </button>
            <button type="button" className="btn-ghost" onClick={p.alArchivar}>
              {p.producto.archivado_en ? 'Restaurar' : 'Archivar'}
            </button>
          </>
        )}
        {p.esAdmin && (
          <button type="button" className="btn-ghost btn-danger" onClick={p.alBorrar}>
            Borrar
          </button>
        )}
      </CabeceraPagina>
      <PanelPestana idBase={ID_BASE} id={p.activa}>
        {p.children}
      </PanelPestana>
    </div>
  )
}

export default function FichaProducto() {
  const { id = '' } = useParams<{ id: string }>()
  const { hasPerm, profile } = useAuth()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [producto, setProducto] = useState<Producto | null>(null)
  const [conversiones, setConversiones] = useState<Conversion[] | null>(null)
  const [errorConversiones, setErrorConversiones] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<PestanaFicha>('datos')
  const [editando, setEditando] = useState(false)
  const { catalogos, cargados, error: errorCatalogos, moneda, recargar: recargarCatalogos } = useCatalogos()
  const esAdmin = !!profile?.roles.includes('admin')
  const puedeEditar = hasPerm('edit_productos')

  const recargarConversiones = useCallback(
    () =>
      leerConversiones([id]).then(
        (c) => {
          setConversiones(c)
          setErrorConversiones(null)
        },
        (e) => {
          setConversiones([])
          setErrorConversiones(traducirError(e))
        },
      ),
    [id],
  )
  const recargar = useCallback(() => leerProducto(id).then(setProducto, (e) => setError(errorLecturaFicha(e))), [id])

  useEffect(() => {
    setProducto(null)
    setActiva('datos')
    // Sin forma de uuid no existe: no se pregunta a la base
    const errorId = errorIdFicha(id)
    setError(errorId)
    if (errorId) return
    void recargar()
    void recargarConversiones()
  }, [id, recargar, recargarConversiones])

  function archivar() {
    if (!producto) return
    const archivar = !producto.archivado_en
    archivarProducto(producto.id, archivar).then(
      () => {
        avisar(archivar ? 'Producto archivado' : 'Producto restaurado')
        void recargar()
      },
      (e) => avisar(traducirError(e, { entidad: 'producto' }), 'error'),
    )
  }

  function borrar() {
    if (!producto || !window.confirm(`¿Borrar ${producto.codigo} «${producto.nombre}» con sus unidades alternas? No se puede deshacer.`)) return
    borrarProducto(producto.id).then(
      () => {
        avisar('Producto borrado')
        navigate('/productos')
      },
      (e) => avisar(traducirError(e, { entidad: 'producto', borrando: true }), 'error'),
    )
  }

  let panel: ReactNode = null
  if (producto && !cargados) {
    panel = errorCatalogos ? (
      <EstadoVacio
        causa={errorCatalogos}
        accion={
          <button type="button" className="btn-ghost" onClick={() => void recargarCatalogos()}>
            Reintentar
          </button>
        }
      />
    ) : (
      <SkeletonLineas n={6} />
    )
  } else if (producto) {
    if (activa === 'datos') panel = <DatosProducto producto={producto} catalogos={catalogos} />
    else if (activa === 'unidades')
      panel = (
        <UnidadesProducto
          producto={producto}
          conversiones={conversiones}
          error={errorConversiones}
          catalogos={catalogos}
          puedeEditar={puedeEditar}
          alReintentar={() => {
            setConversiones(null)
            void recargarConversiones()
          }}
          alCambio={() => {
            void recargarConversiones()
            void recargar()
          }}
        />
      )
    else panel = <Historial producto={producto} catalogos={catalogos} />
  }

  return (
    <>
      <FichaProductoVista
        producto={producto}
        error={error}
        activa={activa}
        puedeEditar={puedeEditar}
        esAdmin={esAdmin}
        sinCatalogos={!cargados}
        alCambiar={setActiva}
        alEditar={() => setEditando(true)}
        alArchivar={archivar}
        alBorrar={borrar}
      >
        {panel}
      </FichaProductoVista>
      {editando && producto && (
        <FormProducto
          producto={producto}
          catalogos={catalogos}
          moneda={moneda}
          onClose={() => setEditando(false)}
          onGuardado={(p) => {
            setProducto(p)
            setEditando(false)
            avisar('Producto guardado')
          }}
        />
      )}
    </>
  )
}
