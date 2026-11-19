import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import BarraFiltros from '../../../components/BarraFiltros'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonFilas } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { aplanar, opcionesArbol, ruta } from '../lib/categorias'
import { buscarProductos, traducirError } from '../lib/datos'
import { aParametros, desdeParametros, FILTROS_VACIOS, filtrosActivos, type FiltrosProductos } from '../lib/filtros'
import { TIPOS_PRODUCTO, type Catalogos, type Producto } from '../lib/tipos'
import { fmtPrecio, nombreImpuesto, nombreUnidad } from '../lib/vistas'
import Exportar from './Exportar'
import FormProducto from './FormProducto'
import Importar from './Importar'
import { useCatalogos } from './useCatalogos'

const PAGINA = 50

type VistaProps = {
  productos: Producto[] | null
  total: number
  filtros: FiltrosProductos
  busqueda: string
  catalogos: Catalogos
  puedeEditar: boolean
  error?: string | null
  alBuscar: (q: string) => void
  alFiltrar: (id: keyof FiltrosProductos, valor: string) => void
  alLimpiar: () => void
  alReintentar: () => void
  alNuevo: () => void
  alImportar: () => void
  alExportar: () => void
  alCargarMas: () => void
}

export function ProductosVista(p: VistaProps) {
  const c = p.catalogos
  const cat = (id: string | null) => (id ? ruta(c.categorias, id) || '—' : '—')
  const archivado = (x: Producto) => x.archivado_en && <span className="muted"> · archivado</span>
  return (
    <div className="page page-productos">
      <CabeceraPagina titulo="Productos">
        <Link to="/productos/catalogos" className="btn-ghost">
          Catálogos
        </Link>
        {p.puedeEditar && (
          <button type="button" className="btn-ghost" onClick={p.alImportar}>
            Importar
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={p.alExportar}>
          Exportar
        </button>
        {p.puedeEditar && (
          <button type="button" className="btn-primary" onClick={p.alNuevo}>
            Nuevo producto
          </button>
        )}
      </CabeceraPagina>

      <BarraFiltros
        buscador={{ valor: p.busqueda, etiqueta: 'Buscar por código o nombre', alCambiar: p.alBuscar }}
        filtros={[
          { id: 'categoria', etiqueta: 'Categoría', valor: p.filtros.categoria, opciones: [{ valor: '', label: 'Categoría: todas' }, ...opcionesArbol(aplanar(c.categorias))] },
          { id: 'tipo', etiqueta: 'Tipo', valor: p.filtros.tipo, opciones: [{ valor: '', label: 'Tipo: todos' }, ...TIPOS_PRODUCTO] },
          { id: 'uso', etiqueta: 'Uso', valor: p.filtros.uso, opciones: [{ valor: '', label: 'Uso: todos' }, { valor: 'venta', label: 'Se vende' }, { valor: 'compra', label: 'Se compra' }] },
          { id: 'archivados', etiqueta: 'Archivados', valor: p.filtros.archivados ? '1' : '', opciones: [{ valor: '', label: 'Sin archivados' }, { valor: '1', label: 'Con archivados' }] },
        ]}
        alCambiar={(id, v) => p.alFiltrar(id as keyof FiltrosProductos, v)}
        alLimpiar={p.alLimpiar}
      />

      {p.productos === null ? (
        <SkeletonFilas filas={6} columnas={6} />
      ) : p.productos.length === 0 ? (
        p.error ? (
          <EstadoVacio
            causa={p.error}
            accion={
              <button type="button" className="btn-ghost" onClick={p.alReintentar}>
                Reintentar
              </button>
            }
          />
        ) : filtrosActivos(p.filtros) > 0 ? (
          <EstadoVacio
            causa="No hay productos con estos filtros."
            accion={
              <button type="button" className="btn-ghost" onClick={p.alLimpiar}>
                Quitar filtros
              </button>
            }
          />
        ) : (
          <EstadoVacio
            causa="Todavía no hay productos."
            accion={
              p.puedeEditar ? (
                <button type="button" className="btn-ghost" onClick={p.alNuevo}>
                  Nuevo producto
                </button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <p className="small muted">{p.total.toLocaleString('es-CO')} productos</p>
          <div className="table-scroll prod-tabla">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Impuesto</th>
                  <th scope="col" className="prod-num">
                    Precio de lista
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.productos.map((x) => (
                  <tr key={x.id} className={x.archivado_en ? 'row-inactive' : undefined}>
                    <td className="prod-codigo">{x.codigo}</td>
                    <td>
                      <Link to={`/productos/${x.id}`}>{x.nombre}</Link>
                      {archivado(x)}
                    </td>
                    <td>{cat(x.categoria_id)}</td>
                    <td>{nombreUnidad(c, x.unidad_base)}</td>
                    <td>{nombreImpuesto(c, x.impuesto)}</td>
                    <td className="prod-num">{fmtPrecio(x.precio_lista, x.precio_lista_moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="prod-tarjetas">
            {p.productos.map((x) => (
              <li key={x.id} className="prod-tarjeta">
                <div className="prod-tarjeta-linea">
                  <Link to={`/productos/${x.id}`}>{x.nombre}</Link>
                  <span className="prod-codigo small">{x.codigo}</span>
                </div>
                <div className="prod-tarjeta-linea small muted">
                  <span>
                    {cat(x.categoria_id)}
                    {archivado(x)}
                  </span>
                  <span className="prod-num">{fmtPrecio(x.precio_lista, x.precio_lista_moneda)}</span>
                </div>
              </li>
            ))}
          </ul>
          {p.productos.length < p.total && (
            <div className="prod-mas">
              <button type="button" className="btn-ghost" onClick={p.alCargarMas}>
                Cargar más
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Productos() {
  const { hasPerm } = useAuth()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filtros = desdeParametros(params)
  const clave = aParametros(filtros).toString()
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'nuevo' | 'importar' | 'exportar' | null>(null)
  const [recarga, setRecarga] = useState(0)
  const { catalogos, moneda, recargar: recargarCatalogos } = useCatalogos()
  const seq = useRef(0)
  const puedeEditar = hasPerm('edit_productos')

  const cambiar = (f: FiltrosProductos) => setParams(aParametros(f), { replace: true })

  // Búsqueda con espera de 200 ms antes de ir a la URL
  useEffect(() => {
    if (busqueda === filtros.q) return
    const t = setTimeout(() => cambiar({ ...filtros, q: busqueda }), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  useEffect(() => {
    const n = ++seq.current
    setProductos(null)
    setError(null)
    buscarProductos(filtros, 0, PAGINA).then(
      (r) => {
        if (n !== seq.current) return
        setProductos(r.filas)
        setTotal(r.total)
      },
      (e) => {
        if (n !== seq.current) return
        setProductos([])
        setTotal(0)
        setError(traducirError(e))
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga])

  function cargarMas() {
    const actuales = productos ?? []
    buscarProductos(filtros, actuales.length, PAGINA).then(
      (r) => {
        setProductos([...actuales, ...r.filas])
        setTotal(r.total)
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  }

  return (
    <>
      <ProductosVista
        productos={productos}
        total={total}
        filtros={filtros}
        busqueda={busqueda}
        catalogos={catalogos}
        puedeEditar={puedeEditar}
        error={error}
        alBuscar={setBusqueda}
        alFiltrar={(id, v) => cambiar({ ...filtros, [id]: id === 'archivados' ? v === '1' : v })}
        alLimpiar={() => {
          setBusqueda('')
          cambiar(FILTROS_VACIOS)
        }}
        alReintentar={() => setRecarga((x) => x + 1)}
        alNuevo={() => setDialogo('nuevo')}
        alImportar={() => setDialogo('importar')}
        alExportar={() => setDialogo('exportar')}
        alCargarMas={cargarMas}
      />
      {dialogo === 'nuevo' && puedeEditar && (
        <FormProducto
          producto={null}
          catalogos={catalogos}
          moneda={moneda}
          onClose={() => setDialogo(null)}
          onGuardado={(p) => {
            setDialogo(null)
            avisar('Producto creado')
            navigate(`/productos/${p.id}`)
          }}
        />
      )}
      {dialogo === 'importar' && puedeEditar && (
        <Importar
          catalogos={catalogos}
          moneda={moneda}
          alCambiarCatalogos={recargarCatalogos}
          onClose={() => {
            setDialogo(null)
            setRecarga((x) => x + 1)
          }}
        />
      )}
      {dialogo === 'exportar' && (
        <Exportar filtros={filtros} total={total} catalogos={catalogos} moneda={moneda} onClose={() => setDialogo(null)} />
      )}
    </>
  )
}
