import { lazy } from 'react'
import type { ModuloShell } from '..'
import { buscarProductos } from './lib/datos'
import { FILTROS_VACIOS } from './lib/filtros'

// Lo que Productos aporta al shell: rutas bajo /productos, búsqueda de
// productos en Ctrl+K (productos_buscar) y la pestaña de Administración de
// clases de impuesto (solo administrador).

const Rutas = lazy(() => import('./RutasProductos'))
const ImpuestosProductos = lazy(() => import('./admin/ImpuestosProductos'))

const shell: ModuloShell = {
  Rutas,
  busquedas: [
    {
      grupo: 'Productos',
      buscar: async (termino) => {
        const { filas } = await buscarProductos({ ...FILTROS_VACIOS, q: termino }, 0, 5)
        return filas.map((p) => ({ key: p.id, title: p.nombre, meta: p.codigo, to: `/productos/${p.id}` }))
      },
    },
  ],
  pestanasAdmin: [{ id: 'productos', label: 'Productos', grupo: 'Módulos', acceso: 'admin', Componente: ImpuestosProductos }],
}

export default shell
