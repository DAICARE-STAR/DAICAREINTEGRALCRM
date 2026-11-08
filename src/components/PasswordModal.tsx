import { useId, useState, type FormEvent } from 'react'
import { logAction } from '../lib/audit'
import { supabase } from '../lib/supabase'
import Dialogo from './Dialogo'

// Se abre desde el menú de usuario, que se cierra al elegir: si quien abrió
// ya no está, el foco vuelve al botón de usuario
const botonUsuario = () => document.querySelector<HTMLElement>('.user-btn')

export default function PasswordModal({ onClose }: { onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const idOk = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pwd.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (pwd !== pwd2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)
    if (err) {
      setError(
        /different/i.test(err.message)
          ? 'La nueva contraseña debe ser diferente a la actual.'
          : 'No se pudo cambiar la contraseña. Intenta de nuevo.'
      )
    } else {
      setOk(true)
      void logAction('cuenta.password', 'Cambió su contraseña', 'auth')
    }
  }

  return (
    <Dialogo
      titulo="Cambiar contraseña"
      onClose={onClose}
      sucio={() => !ok && (pwd !== '' || pwd2 !== '')}
      retorno={botonUsuario}
    >
      {ok ? (
        <>
          <p className="muted" role="status" id={idOk}>
            Tu contraseña fue actualizada correctamente.
          </p>
          <div className="form-actions">
            {/* El formulario desaparece: el foco pasa aquí y no se pierde; la
                confirmación se lee con el botón (la región viva nace ya llena) */}
            <button className="btn-primary" onClick={onClose} autoFocus aria-describedby={idOk}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="form-field">
            <span className="form-label">Nueva contraseña</span>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              minLength={8}
              autoFocus
              autoComplete="new-password"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Confirmar contraseña</span>
            <input
              type="password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Dialogo>
  )
}
