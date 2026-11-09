import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPath, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { esEnlaceInterno } from '../lib/enlaces'
import { supabaseConfigured } from '../lib/supabase'
import { leerLogosCache, logoDe, NOMBRE_PORTAL } from '../lib/instalacion'

export default function Login() {
  const { session, signIn, signOut, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // /login?salir=1 llega del «Cerrar sesión» de las apps (portal-kit.js), que
  // ya revocó la sesión y borró la clave local: aquí signOut() solo limpia el
  // estado, o revoca si se llegó con la sesión viva. Mientras el parámetro
  // esté no se redirige; al terminar se quita y se queda en el login. Si Auth
  // no cierra la sesión, signOut() la borra y recarga ya sin el parámetro (no
  // vuelve): el Navigate de abajo nunca ve una sesión que se pidió cerrar.
  const salir = new URLSearchParams(location.search).get('salir') === '1'
  const procesado = useRef(false)

  useEffect(() => {
    if (!salir) {
      procesado.current = false
      return
    }
    if (procesado.current) return
    procesado.current = true
    const { pathname, search, hash, state } = location
    const params = new URLSearchParams(search)
    params.delete('salir')
    const resto = params.toString()
    const destino = { pathname, search: resto ? `?${resto}` : '', hash }
    void signOut(createPath(destino)).then(() => navigate(destino, { replace: true, state }))
  }, [salir, location, navigate, signOut])

  if (!loading && session && !salir) {
    // Solo rutas del propio portal: «//host» lo rechaza Navigate (React Router 7)
    // y dejaría la pantalla en blanco
    const pedido = (location.state as { from?: { pathname: string } } | null)?.from?.pathname
    const from = esEnlaceInterno(pedido) ? pedido : '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await signIn(email.trim(), password)
    // Mensaje genérico a propósito: no revelar si el correo existe o no
    if (err) setError('Credenciales inválidas o usuario no autorizado.')
    setSubmitting(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <img className="login-logo" src={logoDe(leerLogosCache(), 'banner_440')} alt="" width={200} height={100} />
        <h1>{NOMBRE_PORTAL}</h1>
        {!supabaseConfigured && (
          <p className="alert">
            Supabase no está configurado. Define VITE_SUPABASE_URL y
            VITE_SUPABASE_ANON_KEY en las variables de entorno.
          </p>
        )}
        <label>
          Correo
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <button className="btn-primary" disabled={submitting || salir || !supabaseConfigured}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
