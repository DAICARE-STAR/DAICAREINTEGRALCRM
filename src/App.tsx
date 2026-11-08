import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import CabeceraPagina from './components/CabeceraPagina'
import Layout from './components/Layout'
import LogoLoader from './components/LogoLoader'
import MfaGate from './components/MfaGate'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import { useInstalacion } from './context/InstalacionContext'
import { MODULOS, NUCLEO, puedeVerModulo, type Modulo } from './lib/modulos'
import { shellDe } from './modulos'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ModuloNoDisponible from './pages/ModuloNoDisponible'
import Team from './pages/Team'

// Páginas grandes y/o gateadas por permiso: no todo usuario las necesita,
// así que no viajan en el bundle inicial.
const Admin = lazy(() => import('./pages/Admin'))
const Tools = lazy(() => import('./pages/Tools'))

// Módulos con pantalla: cada uno monta /<ruta>/* con las rutas de su
// src/modulos/<slug>/rutas.tsx si está activo y el usuario lo ve; si no,
// «Módulo no disponible». La base lo cierra igual (has_modulo, modulo_*).
const CON_RUTA = MODULOS.filter((m) => m.slug !== NUCLEO && m.ruta !== null)

function RutaModulo({ modulo }: { modulo: Modulo }) {
  const { profile } = useAuth()
  const { activos, cargando, error, reintentar } = useInstalacion()
  if (cargando) return <LogoLoader label="Cargando…" />
  if (error) return <ModuloNoDisponible nombre={modulo.nombre} error={error} alReintentar={reintentar} />
  const shell = shellDe(modulo.slug)
  if (!shell || !puedeVerModulo(modulo.slug, profile?.roles ?? null, profile?.permissions ?? null, activos)) {
    return <ModuloNoDisponible nombre={modulo.nombre} />
  }
  return <shell.Rutas />
}

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
          {CON_RUTA.map((m) => (
            <Route key={m.slug} path={`${m.ruta!.slice(1)}/*`} element={<RutaModulo modulo={m} />} />
          ))}
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
