import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { NOMBRE_PORTAL } from '../lib/instalacion'

// Segundo paso del inicio de sesión: la sesión de contraseña existe pero
// el usuario tiene verificación en dos pasos activa. Hasta validar el
// código, el RLS (migración 43) mantiene los datos cerrados — esta
// pantalla reemplaza a toda la app.
export default function MfaGate() {
  const { verifyMfa, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (code.trim().length !== 6) {
      setError('El código tiene 6 dígitos.')
      return
    }
    setChecking(true)
    setError(null)
    const { error: err } = await verifyMfa(code.trim())
    setChecking(false)
    if (err) {
      setError(err)
      setCode('')
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src="/brand/logo-banner-transp-440.png" alt={NOMBRE_PORTAL} width={200} height={100} />
        <h1>Verificación en dos pasos</h1>
        <p className="muted">
          Ingresa el código de 6 dígitos de tu aplicación de autenticación.
        </p>
        <label>
          Código
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn-primary" type="submit" disabled={checking}>
          {checking ? 'Verificando…' : 'Continuar'}
        </button>
        <button className="btn-ghost" type="button" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
