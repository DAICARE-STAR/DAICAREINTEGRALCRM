import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../lib/audit'
import { updateMyProfile, uploadAvatar } from '../lib/data'
import { supabase } from '../lib/supabase'
import { aplicarTema, leerTema, TEMAS, type Tema } from '../lib/theme'
import Avatar from './Avatar'
import Dialogo from './Dialogo'
import InfoI from './InfoI'
import { campoPersona } from '../lib/campos'

// Se abre desde el menú de usuario, que se cierra al elegir: si quien abrió
// ya no está, el foco vuelve al botón de usuario
const botonUsuario = () => document.querySelector<HTMLElement>('.user-btn')

// Muestra de cada tema en el selector: su fondo y su acento, con las
// primitivas de la instalación (así se elige por el color y no por el nombre)
const MUESTRA: Record<Tema, { fondo: string; acento: string }> = {
  claro: { fondo: 'var(--pal-base-50)', acento: 'var(--pal-acento-500)' },
  calido: { fondo: 'var(--pal-base-100)', acento: 'var(--pal-acento-500)' },
  oscuro: { fondo: 'var(--pal-base-900)', acento: 'var(--pal-acento-300)' },
}

export default function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { session, profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Apariencia: preferencias por navegador, se aplican al instante
  // (no dependen del botón Guardar)
  const [theme, setTheme] = useState<Tema>(leerTema)

  function elegirTema(t: Tema) {
    aplicarTema(t)
    setTheme(t)
  }

  // Datos de firma del cotizador (migración 31). Si la migración no está
  // aplicada, la sección no se muestra y el guardado no los envía.
  const [firma, setFirma] = useState<{ cargo: string; telefono: string; oficina: string } | null>(
    null
  )
  // La firma tal como llegó de la base, para saber si hay cambios sin guardar
  const firmaCargada = useRef<string | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('cargo, telefono, oficina')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) return
        const d = data as { cargo: string | null; telefono: string | null; oficina: string | null }
        const f = { cargo: d.cargo ?? '', telefono: d.telefono ?? '', oficina: d.oficina ?? '' }
        firmaCargada.current = JSON.stringify(f)
        setFirma(f)
      })
  }, [session])

  // Escape y el clic en el fondo preguntan antes de descartar
  const sucio = () =>
    name !== (profile?.full_name ?? '') ||
    avatar !== (profile?.avatar_url ?? null) ||
    (firma !== null && JSON.stringify(firma) !== firmaCargada.current)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session) return
    setUploading(true)
    setError(null)
    try {
      setAvatar(await uploadAvatar(file, session.user.id))
    } catch {
      setError('No se pudo subir la foto (¿migración 19 aplicada?).')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      await updateMyProfile(session.user.id, {
        full_name: name.trim() || null,
        avatar_url: avatar,
        // Solo si la migración 31 está aplicada (la sección cargó)
        ...(firma
          ? {
              cargo: firma.cargo.trim(),
              telefono: firma.telefono.trim(),
              oficina: firma.oficina.trim(),
            }
          : {}),
      })
      void logAction('cuenta.perfil', 'Actualizó su nombre/foto de perfil', 'profiles', session.user.id)
      await refreshProfile()
      onClose()
    } catch {
      setError('No se pudo guardar el perfil.')
      setSaving(false)
    }
  }

  return (
    <Dialogo
      titulo="Editar perfil"
      onClose={onClose}
      onSubmit={submit}
      sucio={sucio}
      retorno={botonUsuario}
    >
      <div className="profile-edit-avatar">
        <Avatar url={avatar} name={name} email={session?.user.email} size={72} />
        <div className="profile-edit-avatar-actions">
          <button
            type="button"
            className="btn-ghost btn-small"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Subiendo…' : avatar ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {avatar && (
            <button
              type="button"
              className="btn-ghost btn-small"
              onClick={() => setAvatar(null)}
              disabled={uploading}
            >
              Quitar
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={onFile}
          />
        </div>
      </div>

      <label className="form-field">
        <span className="form-label">Nombre visible</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...campoPersona('perfil-nombre')}
          maxLength={60}
          autoFocus
        />
      </label>

      <div className="form-field">
        <span className="form-label">Tema</span>
        <div className="theme-opts">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              className={
                'theme-opt btn-small ' +
                (theme === t.id ? 'btn-primary' : 'btn-ghost')
              }
              onClick={() => elegirTema(t.id)}
            >
              <span className="theme-swatch" style={{ background: MUESTRA[t.id].fondo }}>
                <i style={{ background: MUESTRA[t.id].acento }} />
              </span>
              {t.nombre}
            </button>
          ))}
        </div>
      </div>

      {firma && (
        <>
          <div className="titulo-info muted small" style={{ margin: '0.6rem 0 0' }}>
            <span>Datos de firma</span>
            <InfoI texto="Salen en las cotizaciones y cartas del cotizador cuando eres el firmante." />
          </div>
          <label className="form-field">
            <span className="form-label">Cargo</span>
            <input
              value={firma.cargo}
              onChange={(e) => setFirma({ ...firma, cargo: e.target.value })}
              {...campoPersona('perfil-cargo')}
              maxLength={120}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Teléfono</span>
            <input
              value={firma.telefono}
              onChange={(e) => setFirma({ ...firma, telefono: e.target.value })}
              {...campoPersona('perfil-telefono')}
              maxLength={60}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Oficina</span>
            <input
              value={firma.oficina}
              onChange={(e) => setFirma({ ...firma, oficina: e.target.value })}
              {...campoPersona('perfil-oficina')}
              maxLength={160}
            />
          </label>
        </>
      )}

      {error && <p className="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={saving || uploading}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn-ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}
