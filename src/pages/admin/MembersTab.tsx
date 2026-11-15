import { useEffect, useMemo, useState } from 'react'
import CabeceraAdmin from './CabeceraAdmin'
import InvitarMiembro from './InvitarMiembro'
import { SkeletonLista } from '../../components/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { logAction } from '../../lib/audit'
import {
  addUserRole,
  fetchAllConnectors,
  fetchConnectors,
  fetchProfiles,
  fetchRoles,
  removeUserRole,
  toolPermKey,
  updateMemberName,
} from '../../lib/data'
import { MODULOS } from '../../lib/modulos'
import { PERMISOS_SOLO_ADMIN, PERMISSIONS, type Profile, type RoleDef } from '../../types'

function permLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key
}

// Cuentas de servicio (bot, claude-dev): se reconocen por su rol, el
// mismo criterio de las migraciones 67 y 70. No cuentan como miembros.
// claude-qa solo lleva member y sin el correo (fetchProfiles no lo trae)
// no se distingue aquí.
function esServicio(p: Profile): boolean {
  return p.roles.some((r) => r === 'bot' || r === 'claude-dev')
}

export default function MembersTab() {
  const { profile: me, hasPerm } = useAuth()
  const iAmAdmin = !!me?.roles.includes('admin')
  const puedeInvitar = iAmAdmin || hasPerm('manage_members')
  const [invitando, setInvitando] = useState(false)
  // null = cargando (skeleton), [] = sin miembros
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  // Detalle del acceso resultante (unión de permisos) expandido por miembro
  const [openAccess, setOpenAccess] = useState<string | null>(null)
  // Edición del nombre de un miembro (solo admin)
  const [editingName, setEditingName] = useState<{ id: string; value: string } | null>(null)

  function load() {
    fetchProfiles()
      .then(setProfiles)
      .catch(() => {
        setProfiles((p) => p ?? [])
        setError('No se pudo cargar la lista de miembros.')
      })
  }

  // Etiquetas de los permisos de visibilidad (app_<slug> / herr_<clave>):
  // sin ellas el contador de acceso ocultaría todo lo que otorgan
  const [visLabels, setVisLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
    fetchRoles()
      .then(setRoles)
      .catch(() => setRoles([]))
    void (async () => {
      const m: Record<string, string> = {}
      // Permisos de módulo con su etiqueta del registro
      MODULOS.forEach((mod) => mod.permisos.forEach((p) => (m[p.clave] = p.etiqueta)))
      try {
        const tools = await fetchAllConnectors().catch(() => fetchConnectors())
        tools.forEach((t) => {
          m[toolPermKey(t.name)] = 'Ver ' + t.name
        })
      } catch {
        /* sin catálogo de herramientas */
      }
      setVisLabels(m)
    })()
  }, [])

  const permsOf = useMemo(() => {
    const m: Record<string, string[]> = {}
    roles.forEach((r) => (m[r.name] = r.permissions ?? []))
    return m
  }, [roles])

  const colorOf = useMemo(() => {
    const m: Record<string, string | null> = {}
    roles.forEach((r) => (m[r.name] = r.color))
    return m
  }, [roles])

  // Unión de permisos de los roles asignados (admin = todos, como en RLS),
  // separando los clásicos de la visibilidad app_*/herr_*
  function effectivePerms(assigned: string[]): { clasicos: string[]; visibilidad: string[] } {
    const set = new Set<string>()
    assigned.forEach((r) => (permsOf[r] ?? []).forEach((p) => set.add(p)))
    const clasicos = assigned.includes('admin')
      ? PERMISSIONS.map((p) => p.key)
      : PERMISSIONS.map((p) => p.key).filter((k) => set.has(k))
    const visibilidad = [...set].filter((k) => /^(app_|herr_)/.test(k)).sort()
    return { clasicos, visibilidad }
  }

  async function saveName() {
    if (!editingName) return
    const nuevo = editingName.value.trim()
    if (!nuevo) {
      setError('El nombre no puede quedar vacío.')
      return
    }
    setError(null)
    setSavingId(editingName.id)
    try {
      await updateMemberName(editingName.id, nuevo)
      void logAction('miembro.nombre', `Corrigió el nombre de un miembro a "${nuevo}"`, 'profiles', editingName.id)
      setEditingName(null)
      load()
    } catch {
      setError('No se pudo guardar el nombre (¿permisos?).')
    } finally {
      setSavingId(null)
    }
  }

  // Alternar un rol desde su chip (guardado inmediato, optimista con
  // reversión si RLS lo rechaza). Mismas reglas de siempre: solo admin
  // asigna, y nadie se quita su propio admin.
  async function toggle(p: Profile, role: string) {
    if (!iAmAdmin || savingId === p.id) return
    const isSelf = p.id === me?.id
    const has = p.roles.includes(role)
    if (has && isSelf && role === 'admin') return
    setError(null)
    setSavingId(p.id)
    const previous = profiles
    setProfiles((list) =>
      (list ?? []).map((x) =>
        x.id === p.id
          ? { ...x, roles: has ? x.roles.filter((r) => r !== role) : [...x.roles, role] }
          : x
      )
    )
    try {
      if (has) {
        await removeUserRole(p.id, role)
        void logAction('miembro.rol', `Quitó el rol "${role}" a ${p.full_name ?? p.id}`, 'profiles', p.id)
      } else {
        await addUserRole(p.id, role)
        void logAction('miembro.rol', `Asignó el rol "${role}" a ${p.full_name ?? p.id}`, 'profiles', p.id)
      }
      load()
    } catch {
      setProfiles(previous)
      setError(has ? 'No se pudo quitar el rol.' : 'No se pudo asignar el rol (¿permisos?).')
    } finally {
      setSavingId(null)
    }
  }

  // Lo indispensable, en el «i» junto al conteo (sin leyenda en pantalla)
  const ayuda =
    'Invitar envía el correo de alta; la instalación tiene un límite de miembros. Las bajas se hacen en Supabase (Authentication → Users). Cada chip activa o quita un rol al instante; los permisos de un miembro son la unión de todos sus roles.' +
    (iAmAdmin ? '' : ' Solo un admin puede cambiar roles y nombres.')

  const nMiembros = profiles?.filter((p) => !esServicio(p)).length ?? 0

  return (
    <section>
      <CabeceraAdmin
        titulo={
          profiles === null ? 'Miembros' : `${nMiembros} ${nMiembros === 1 ? 'miembro' : 'miembros'}`
        }
        ayuda={ayuda}
      >
        {puedeInvitar && (
          <button className="btn-primary" type="button" onClick={() => setInvitando(true)}>
            Invitar
          </button>
        )}
      </CabeceraAdmin>
      {invitando && (
        <InvitarMiembro
          roles={roles}
          esAdmin={iAmAdmin}
          rolesSoloAdmin={new Set(roles.filter((r) => r.name === 'admin' || r.permissions.some((p) => PERMISOS_SOLO_ADMIN.includes(p))).map((r) => r.name))}
          onClose={() => setInvitando(false)}
          onInvitado={load}
        />
      )}
      {error && <p className="alert">{error}</p>}

      {profiles === null && <SkeletonLista n={4} avatar={false} lineas={2} />}
      <div className="member-cards">
        {profiles?.map((p) => {
          const isSelf = p.id === me?.id
          const assigned = p.roles
          const { clasicos, visibilidad } = effectivePerms(assigned)
          const totalAcceso = clasicos.length + (assigned.includes('admin') ? 0 : visibilidad.length)
          const accessOpen = openAccess === p.id
          return (
            <div className="member-card" key={p.id}>
              <div className="member-card-head">
                {editingName?.id === p.id ? (
                  <span className="member-name-edit">
                    <input name="ts-miembro-nombre" autoComplete="off"
                      value={editingName.value}
                      maxLength={120}
                      autoFocus
                      onChange={(e) => setEditingName({ id: p.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void saveName()
                        }
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      aria-label="Nombre del miembro"
                    />
                    <button
                      className="btn-primary btn-small"
                      disabled={savingId === p.id}
                      onClick={() => void saveName()}
                    >
                      Guardar
                    </button>
                    <button className="btn-ghost btn-small" onClick={() => setEditingName(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <span className="member-card-name">
                    {p.full_name ?? '(sin nombre)'}
                    {isSelf && <span className="muted"> (tú)</span>}
                    {esServicio(p) && <span className="muted"> (servicio)</span>}
                    {iAmAdmin && (
                      <button
                        className="btn-ghost btn-small member-name-btn"
                        title="Corregir el nombre de este miembro"
                        onClick={() => setEditingName({ id: p.id, value: p.full_name ?? '' })}
                      >
                        Editar
                      </button>
                    )}
                  </span>
                )}
                <button
                  className="btn-ghost btn-small"
                  aria-expanded={accessOpen}
                  onClick={() => setOpenAccess(accessOpen ? null : p.id)}
                >
                  {assigned.includes('admin')
                    ? 'Acceso total'
                    : totalAcceso + (totalAcceso === 1 ? ' permiso' : ' permisos')}
                </button>
              </div>

              <div className="chip-cloud">
                {roles.length === 0 && assigned.map((r) => (
                  <span key={r} className="role-chip">{r}</span>
                ))}
                {roles.map((r) => {
                  const on = assigned.includes(r.name)
                  const lockedSelfAdmin = on && isSelf && r.name === 'admin'
                  const clickable = iAmAdmin && !lockedSelfAdmin
                  const color = colorOf[r.name]
                  return (
                    <button
                      key={r.name}
                      type="button"
                      className="chipbtn"
                      data-on={on ? '1' : '0'}
                      aria-pressed={on}
                      disabled={!clickable || savingId === p.id}
                      title={
                        lockedSelfAdmin
                          ? 'No puedes quitarte tu propio rol admin'
                          : r.description ?? r.name
                      }
                      style={on && color ? { color, borderColor: color } : undefined}
                      onClick={() => void toggle(p, r.name)}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>

              {accessOpen && (
                <div className="member-access">
                  {assigned.includes('admin') ? (
                    <span>admin: todos los permisos y toda la visibilidad del portal.</span>
                  ) : totalAcceso === 0 ? (
                    <span>Sin permisos: solo las secciones abiertas a todo el equipo.</span>
                  ) : (
                    <>
                      {clasicos.map((k) => (
                        <span key={k}>{permLabel(k)}</span>
                      ))}
                      {visibilidad.map((k) => (
                        <span key={k}>{visLabels[k] ?? k}</span>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
