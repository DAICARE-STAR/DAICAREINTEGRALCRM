import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import CabeceraPagina from './components/CabeceraPagina'
import Layout from './components/Layout'
import LogoLoader from './components/LogoLoader'
import MfaGate from './components/MfaGate'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Team from './pages/Team'

// Páginas grandes y/o gateadas por permiso: no todo usuario las necesita,
// así que no viajan en el bundle inicial.
const Admin = lazy(() => import('./pages/Admin'))
const Tools = lazy(() => import('./pages/Tools'))

// Solo las rutas del núcleo: las de cada módulo llegan con su módulo y el
// filtrado por módulos activos con N-3 (docs/origen.md).

export default function App() {
  const { session, mfaPending } = useAuth()
  // Sesión de contraseña con segundo factor activo: falta el código TOTP.
  // El RLS (migración 43) mantiene los datos cerrados; se muestra solo el
  // desafío hasta subir a aal2.
  if (session && mfaPending) return <MfaGate />
  return (
    <Suspense fallback={<LogoLoader label="Cargando…" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="herramientas" element={<Tools />} />
          <Route path="equipo" element={<Team />} />
          <Route
            path="admin/:seccion?"
            element={
              <ProtectedRoute
                perm={['manage_apps', 'manage_connectors', 'manage_members', 'manage_roles']}
              >
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <div className="page">
                <CabeceraPagina titulo="404" />
                <p className="muted">Página no encontrada.</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}
