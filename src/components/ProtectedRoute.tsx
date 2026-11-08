import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import CabeceraPagina from './CabeceraPagina'
import type { Permission } from '../types'
import LogoLoader from './LogoLoader'

export default function ProtectedRoute({
  children,
  perm,
}: {
  children: ReactNode
  // Permiso(s) requerido(s); con lista basta tener uno. Sin `perm`, solo sesión.
  perm?: Permission | Permission[]
}) {
  const { session, profile, loading, hasPerm } = useAuth()
  const location = useLocation()

  if (loading) return <LogoLoader />
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  // Espera el perfil antes de decidir sobre permisos (evita falsos "denegado")
  if (perm && !profile) return <LogoLoader />

  if (perm && !hasPerm(perm)) {
    return (
      <div className="page">
        <CabeceraPagina titulo="Acceso restringido" />
        <p className="muted">
          No tienes permisos para ver esta sección. Contacta a un administrador.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
