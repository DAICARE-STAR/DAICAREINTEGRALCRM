import { useState, type FormEvent } from 'react'
import Dialogo from '../../components/Dialogo'
import { supabase } from '../../lib/supabase'
import { avisoParcial } from '../../lib/invitacion'
import type { RoleDef } from '../../types'

// Diálogo «Invitar» de Miembros (N-7): correo, nombre y roles. La función
// invitar-miembro decide todo (permiso, límite, escalada); aquí solo se
// muestra su mensaje. Los roles que da solo un admin se ofrecen solo al admin.

export default function InvitarMiembro({
  roles,
  esAdmin,
  rolesSoloAdmin,
  onClose,
  onInvitado,
}: {
  roles: RoleDef[]
  esAdmin: boolean
  rolesSoloAdmin: Set<string>
  onClose: () => void
  onInvitado: () => void
}) {
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [elegidos, setElegidos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [faltante, setFaltante] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const ofrecidos = roles.filter((r) => esAdmin || !rolesSoloAdmin.has(r.name))

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Tu sesión venció: vuelve a entrar.')
      const res = await fetch('/api/invitar-miembro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ correo, nombre, roles: elegidos }),
      })
      const cuerpo = (await res.json().catch(() => null)) as
        | { error?: string; rolesAsignados?: boolean; nombreGuardado?: boolean }
        | null
      if (!res.ok) throw new Error(cuerpo?.error ?? `No se pudo invitar (${res.status}).`)
      setFaltante(avisoParcial(cuerpo))
      setListo(true)
      onInvitado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialogo
      titulo="Invitar miembro"
      onClose={onClose}
      onSubmit={listo ? undefined : enviar}
      sucio={() => !listo && (correo !== '' || nombre !== '' || elegidos.length > 0)}
    >
      {listo ? (
        <>
          <p className="muted" role="status">
            Invitación enviada a {correo}.
          </p>
          {faltante && (
            <p className="alert" role="alert">
              {faltante}
            </p>
          )}
          <div className="form-actions">
            <button className="btn-primary" type="button" onClick={onClose} autoFocus>
              Listo
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="form-field">
            <span className="form-label">Correo</span>
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required maxLength={254} autoFocus autoComplete="off" />
          </label>
          <label className="form-field">
            <span className="form-label">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} autoComplete="off" />
          </label>
          <fieldset className="form-field">
            <legend className="form-label">Roles</legend>
            {ofrecidos.map((r) => (
              <label key={r.name} className="form-check">
                <input
                  type="checkbox"
                  checked={elegidos.includes(r.name)}
                  onChange={(e) =>
                    setElegidos((l) => (e.target.checked ? [...l, r.name] : l.filter((x) => x !== r.name)))
                  }
                />
                {r.name}
              </label>
            ))}
          </fieldset>
          {error && <p className="alert" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Invitar'}
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </Dialogo>
  )
}
