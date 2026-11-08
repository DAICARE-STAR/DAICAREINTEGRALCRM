import { lazy, Suspense } from 'react'
import { Navigate, NavLink, useParams } from 'react-router'
import CabeceraPagina from '../components/CabeceraPagina'
import { IconoAdministracion } from '../components/IconosNav'
import { SkeletonLineas } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useTitulo } from '../lib/useTitulo'
import type { Permission } from '../types'

const AuditTab = lazy(() => import('./admin/AuditTab'))
const ConnectorsTab = lazy(() => import('./admin/ConnectorsTab'))
const MembersTab = lazy(() => import('./admin/MembersTab'))
const NovedadesTab = lazy(() => import('./admin/NovedadesTab'))
const RolesTab = lazy(() => import('./admin/RolesTab'))
const UsoTab = lazy(() => import('./admin/UsoTab'))
const WidgetsTab = lazy(() => import('./admin/WidgetsTab'))

// Pestañas del núcleo. Aplicaciones, Marcas, Correo e IA llegan con su
// módulo (docs/origen.md).
type TabId = 'widgets' | 'connectors' | 'members' | 'roles' | 'uso' | 'registro' | 'novedades'

// Quién ve cada sección: un permiso, solo admin o cualquiera que entre (la
// ruta ya exige al menos uno de los permisos de administración)
type Acceso = Permission | 'admin' | 'todos'

// Cuatro grupos (Ley de Hick). Sistema es infraestructura: el registro de
// acciones, solo admin. Cada sección
// tiene su ruta: /admin/<id>.
const TABS: { id: TabId; label: string; grupo: string; acceso: Acceso }[] = [
  { id: 'widgets', label: 'Widgets', grupo: 'Portal', acceso: 'manage_apps' },
  { id: 'connectors', label: 'Herramientas', grupo: 'Portal', acceso: 'manage_connectors' },
  { id: 'members', label: 'Miembros', grupo: 'Personas', acceso: 'manage_members' },
  { id: 'roles', label: 'Roles', grupo: 'Personas', acceso: 'manage_roles' },
  // Uso del portal por persona: tiempo por app y acciones (migración 73).
  // Seguimiento del equipo: solo admin, por decisión del usuario.
  { id: 'uso', label: 'Uso', grupo: 'Personas', acceso: 'admin' },
  { id: 'registro', label: 'Registro', grupo: 'Sistema', acceso: 'admin' },
  { id: 'novedades', label: 'Novedades', grupo: 'Novedades', acceso: 'todos' },
]

export default function Admin() {
  const { hasPerm, profile } = useAuth()
  const { seccion } = useParams<{ seccion?: string }>()
  const isAdmin = !!profile?.roles.includes('admin')
  const puede = (a: Acceso) => a === 'todos' || (a === 'admin' ? isAdmin : hasPerm(a))
  const visibles = TABS.filter((t) => puede(t.acceso))
  // Una sección inexistente o que dejó de ser visible (permisos) cae a la
  // primera disponible (Novedades siempre lo está)
  const activa = visibles.find((t) => t.id === seccion)
  const primera = visibles[0]?.id ?? 'novedades'

  useTitulo(activa ? `Administración — ${activa.label}` : 'Administración')

  if (!activa) return <Navigate to={`/admin/${primera}`} replace />

  const grupos = [...new Set(visibles.map((t) => t.grupo))].map((nombre) => ({
    nombre,
    items: visibles.filter((t) => t.grupo === nombre),
  }))

  return (
    <div className="page page-admin">
      <CabeceraPagina titulo="Administración" icono={<IconoAdministracion size={24} />} />

      <div className="admin-layout">
        <nav className="admin-menu" aria-label="Secciones de administración">
          {grupos.map((g) => (
            <div className="admin-menu-grupo" key={g.nombre}>
              {/* Un grupo de una sola entrada con su mismo nombre (Novedades) va sin rótulo */}
              {(g.items.length > 1 || g.items[0].label !== g.nombre) && (
                <span className="admin-menu-titulo">{g.nombre}</span>
              )}
              {g.items.map((t) => (
                <NavLink key={t.id} to={`/admin/${t.id}`} end>
                  {t.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-panel">
          <Suspense fallback={<SkeletonLineas n={6} />}>
            {activa.id === 'widgets' && <WidgetsTab />}
            {activa.id === 'connectors' && <ConnectorsTab />}
            {activa.id === 'members' && <MembersTab />}
            {activa.id === 'roles' && <RolesTab />}
            {activa.id === 'uso' && <UsoTab />}
            {activa.id === 'registro' && <AuditTab />}
            {activa.id === 'novedades' && <NovedadesTab />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
