import { lazy } from 'react'
import type { ModuloShell } from '..'
import { buscarCuentas } from './lib/datos'
import { FILTROS_VACIOS } from './lib/filtros'

// Lo que el CRM aporta al shell: rutas bajo /crm, búsqueda de cuentas en
// Ctrl+K (crm_buscar, sin salud) y la pestaña de Administración.

const Rutas = lazy(() => import('./RutasCrm'))
const AjustesCrm = lazy(() => import('./admin/AjustesCrm'))

const shell: ModuloShell = {
  Rutas,
  busquedas: [
    {
      grupo: 'CRM',
      buscar: async (termino) => {
        const { filas } = await buscarCuentas({ ...FILTROS_VACIOS, q: termino }, 0, 5)
        return filas.map((c) => ({
          key: c.id,
          title: c.nombre,
          meta: c.tipo === 'persona' ? 'Persona' : 'Empresa',
          to: `/crm/cuentas/${c.id}`,
        }))
      },
    },
  ],
  pestanasAdmin: [{ id: 'crm', label: 'CRM', grupo: 'Módulos', acceso: 'admin', Componente: AjustesCrm }],
}

export default shell
