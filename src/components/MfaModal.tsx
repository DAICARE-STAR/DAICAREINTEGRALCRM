import { useEffect, useId, useState, type FormEvent } from 'react'
import { logAction } from '../lib/audit'
import { supabase } from '../lib/supabase'
import Dialogo from './Dialogo'
import InfoI from './InfoI'

// Gestión de la verificación en dos pasos (TOTP) de la propia cuenta:
// activar (QR + código de confirmación) o desactivar. El candado real
// lo pone el RLS de la migración 43: con el factor activo, una sesión
// de solo-contraseña no puede leer ni escribir datos.

type Estado =
  | { fase: 'cargando' }
  | { fase: 'inactivo' }
  | { fase: 'inscribiendo'; factorId: string; qrSvg: string; secret: string }
  | { fase: 'activo'; factorId: string; desde: string | null }

// Se abre desde el menú de usuario, que se cierra al elegir: si quien abrió
// ya no está, el foco vuelve al botón de usuario
const botonUsuario = () => document.querySelector<HTMLElement>('.user-btn')

export default function MfaModal({ onClose }: { onClose: () => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const idCodigo = useId()

  async function cargar() {
    const { data, error: err } = await supabase.auth.mfa.listFactors()
    if (err) {
      setError('No se pudo consultar el estado del segundo factor.')
      setEstado({ fase: 'inactivo' })
      return
    }
    const verificado = data.totp.find((f) => f.status === 'verified')
    // Factores a medio inscribir de intentos anteriores: se limpian
    for (const f of data.totp.filter((f) => f.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})
    }
    setEstado(
      verificado
        ? { fase: 'activo', factorId: verificado.id, desde: verificado.created_at ?? null }
        : { fase: 'inactivo' }
    )
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function activar() {
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Team Portal del equipo',
    })
    setBusy(false)
    if (err || !data) {
      setError('No se pudo iniciar la activación: ' + (err?.message ?? 'error desconocido'))
      return
    }
    setEstado({
      fase: 'inscribiendo',
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
    })
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (estado.fase !== 'inscribiendo') return
    if (code.trim().length !== 6) {
      setError('El código tiene 6 dígitos.')
      return
    }
    setBusy(true)
    setError(null)
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: estado.factorId,
    })
    if (cErr || !ch) {
      setBusy(false)
      setError('No se pudo verificar el código. Intenta de nuevo.')
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: estado.factorId,
      challengeId: ch.id,
      code: code.trim(),
    })
    setBusy(false)
    if (vErr) {
      setError('Código incorrecto. Revisa la app de autenticación e intenta de nuevo.')
      setCode('')
      return
    }
    void logAction('cuenta.mfa_activado', 'Activó la verificación en dos pasos', 'auth')
    setCode('')
    setEstado({ fase: 'activo', factorId: estado.factorId, desde: new Date().toISOString() })
  }

  async function cancelarInscripcion() {
    // Con challenge/verify en curso, un unenroll en paralelo dejaría el factor
    // borrado tras escanear el QR o verificado con el modal ya cerrado
    if (busy) return
    if (estado.fase === 'inscribiendo') {
      await supabase.auth.mfa.unenroll({ factorId: estado.factorId }).catch(() => {})
    }
    onClose()
  }

  async function desactivar() {
    if (estado.fase !== 'activo') return
    if (
      !window.confirm(
        '¿Desactivar la verificación en dos pasos? Tu cuenta volverá a protegerse solo con la contraseña.'
      )
    )
      return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: estado.factorId })
    setBusy(false)
    if (err) {
      setError('No se pudo desactivar: ' + err.message)
      return
    }
    void logAction('cuenta.mfa_desactivado', 'Desactivó la verificación en dos pasos', 'auth')
    setEstado({ fase: 'inactivo' })
  }

  return (
    <Dialogo
      titulo="Verificación en dos pasos"
      onClose={() => void cancelarInscripcion()}
      sucio={() => estado.fase === 'inscribiendo' && !busy}
      retorno={botonUsuario}
    >
      {estado.fase === 'cargando' && <p className="muted">Consultando…</p>}

      {estado.fase === 'inactivo' && (
        <>
          <div className="titulo-info">
            <p className="muted">Inactiva</p>
            <InfoI texto="Además de la contraseña, un código de 6 dígitos de una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…). Con el factor activo, una sesión sin el código no puede acceder a los datos del portal." />
          </div>
          {error && <p className="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" onClick={() => void activar()} disabled={busy}>
              {busy ? 'Preparando…' : 'Activar'}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      )}

      {estado.fase === 'inscribiendo' && (
        <form onSubmit={confirmar}>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(estado.qrSvg)}`}
              alt="Código QR para la aplicación de autenticación"
              style={{ width: 180, height: 180, background: '#fff', padding: 8 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            Clave manual: <code>{estado.secret}</code>
          </p>
          <div className="form-field">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <label className="form-label" htmlFor={idCodigo}>
                Código de confirmación
              </label>
              <InfoI texto="Escanea el código QR con tu aplicación de autenticación (o ingresa la clave manual) y escribe el código de 6 dígitos que genere." />
            </span>
            <input
              id={idCodigo}
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Verificando…' : 'Confirmar y activar'}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => void cancelarInscripcion()}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {estado.fase === 'activo' && (
        <>
          <div className="titulo-info">
            <p className="muted">
              <strong>Activa</strong>
              {estado.desde
                ? ` desde el ${new Date(estado.desde).toLocaleDateString('es-CO', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`
                : ''}
            </p>
            <InfoI texto="Cada inicio de sesión pide el código de tu aplicación." />
          </div>
          {error && <p className="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-danger" onClick={() => void desactivar()} disabled={busy}>
              {busy ? 'Desactivando…' : 'Desactivar'}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </Dialogo>
  )
}
