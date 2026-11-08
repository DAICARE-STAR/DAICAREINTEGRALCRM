import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import CabeceraAdmin from './CabeceraAdmin'
import { SkeletonFilas } from '../../components/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { logAction } from '../../lib/audit'
import {
  countRoleMembers,
  createRole,
  deleteRole,
  fetchAllApps,
  fetchAllConnectors,
  fetchApps,
  fetchConnectors,
  fetchRoles,
  toolPermKey,
  updateRole,
  validateRoleName,
} from '../../lib/data'
import { PERMISOS_SOLO_ADMIN, PERMISSIONS, type RoleDef } from '../../types'

// Un rol con alguno de estos permisos solo lo elimina un admin
// (roles_guard_escalada, migración 63).
function llevaSoloAdmin(role: RoleDef) {
  return (role.permissions ?? []).some((p) => PERMISOS_SOLO_ADMIN.includes(p))
}

// Roles que se buscan por NOMBRE: las listas de avisos (check-new-leads,
// trigger de pérdidas) y las cuentas de servicio (bot, claude-dev; las
// reconocen las migraciones 67 y 70). Renombrarlos rompe los avisos o el
// acceso de esas cuentas sin ningún error visible; a un no admin,
// roles_guard_escalada (migración 63) tampoco le deja eliminarlos.
const PROTECTED_NAMES = ['leads', 'perdidas', 'bot', 'claude-dev']

// Nombres que ningún rol nuevo o renombrado puede tomar: espejo de
// v_reservados en roles_guard_escalada (migración 63). La base solo frena a
// un no admin; a un admin lo frena esta lista (un «bot» creado antes de
// aplicar la 67 la detendría). admin y member son de sistema (is_system).
const NOMBRES_RESERVADOS = ['admin', 'member', ...PROTECTED_NAMES]

// Mensaje para un nombre que la base rechaza (único o roles_guard_escalada)
function errorNombre(err: unknown, porDefecto: string) {
  if (!(err instanceof Error)) return porDefecto
  if (err.message.includes('duplicate')) return 'Ya existe un rol con ese nombre.'
  if (err.message.includes('Visible para'))
    return 'Ese nombre ya figura en «Visible para» de una app o herramienta: solo un admin lo reutiliza.'
  return porDefecto
}

// Agrupación visual de la matriz (solo presentación; el catálogo real
// sigue siendo PERMISSIONS en types.ts)
const PERM_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: 'Operación',
    keys: ['edit_projects', 'delete_projects', 'edit_crm', 'manage_products', 'view_mail', 'view_billing'],
  },
  {
    label: 'Sitio web',
    keys: ['manage_blog', 'manage_brands', 'manage_projects', 'manage_notice', 'manage_leads', 'view_analytics'],
  },
  { label: 'Radar', keys: ['view_credentials', 'manage_credentials', 'edit_tender_offers', 'delete_tender_offers'] },
  {
    label: 'Administración',
    keys: ['manage_apps', 'manage_connectors', 'manage_members', 'manage_roles'],
  },
]

// Columnas en el orden de los grupos; cualquier permiso futuro que no
// esté agrupado aparece al final para no perderse de la matriz.
function orderedPerms() {
  const grouped = PERM_GROUPS.flatMap((g) => g.keys)
  const rest = PERMISSIONS.map((p) => p.key).filter((k) => !grouped.includes(k))
  return rest.length
    ? [...PERM_GROUPS, { label: 'Otros', keys: rest }]
    : PERM_GROUPS
}

// Visibilidad como permiso (reforma roles→permisos): cada app y cada
// herramienta aporta una columna app_<slug> / herr_<slug>. Marcarla en un
// rol hace visible esa entrada del menú cuando su "Visible para" incluye
// la clave del permiso; los roles-visor antiguos siguen funcionando
// mientras dura la transición.
type VisCol = { key: string; label: string }

const DEFAULT_COLOR = '#8A94A6'

export default function RolesTab() {
  const { profile } = useAuth()
  const isAdmin = !!profile?.roles.includes('admin')
  const misPermisos = profile?.permissions ?? []
  const [roles, setRoles] = useState<RoleDef[]>([])
  // Hasta la primera respuesta la matriz muestra skeleton, no un vacío
  const [cargado, setCargado] = useState(false)
  // Espejo síncrono del estado + cola de guardado POR ROL: dos clics rápidos
  // en casillas del mismo rol no deben pisarse (cada PATCH viaja el array
  // completo de permisos).
  const rolesRef = useRef<RoleDef[]>([])
  const saveQueue = useRef<Record<string, Promise<void>>>({})
  function applyRoles(next: RoleDef[]) {
    rolesRef.current = next
    setRoles(next)
  }
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Fila expandida con el detalle (descripción, color, renombrar, eliminar)
  const [openRole, setOpenRole] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ name: string; description: string; color: string }>({
    name: '',
    description: '',
    color: DEFAULT_COLOR,
  })
  const [newName, setNewName] = useState('')
  const [visApps, setVisApps] = useState<VisCol[]>([])
  const [visTools, setVisTools] = useState<VisCol[]>([])

  useEffect(() => {
    // Catálogo completo si el RLS lo permite; si no, el activo (suficiente)
    fetchAllApps()
      .catch(() => fetchApps())
      .then((a) => setVisApps(a.map((x) => ({ key: 'app_' + x.slug, label: x.name }))))
      .catch(() => setVisApps([]))
    fetchAllConnectors()
      .catch(() => fetchConnectors())
      .then((c) => {
        const vistos = new Set<string>()
        const cols: VisCol[] = []
        c.forEach((x) => {
          const key = toolPermKey(x.name)
          if (vistos.has(key)) return
          vistos.add(key)
          cols.push({ key, label: x.name })
        })
        setVisTools(cols)
      })
      .catch(() => setVisTools([]))
  }, [])

  const groups = useMemo(() => {
    const g = [...orderedPerms()]
    if (visApps.length) g.push({ label: 'Aplicaciones', keys: visApps.map((x) => x.key) })
    if (visTools.length) g.push({ label: 'Herramientas', keys: visTools.map((x) => x.key) })
    return g
  }, [visApps, visTools])

  const permInfo = useMemo(() => {
    const m: Record<string, { label: string; description: string }> = {}
    PERMISSIONS.forEach((p) => {
      m[p.key] = { label: p.label, description: p.description }
    })
    visApps.forEach((x) => {
      m[x.key] = { label: x.label, description: 'Ver la aplicación ' + x.label }
    })
    visTools.forEach((x) => {
      m[x.key] = { label: x.label, description: 'Ver la herramienta ' + x.label }
    })
    return m
  }, [visApps, visTools])

  function load() {
    fetchRoles()
      .then(applyRoles)
      .catch(() => setError('No se pudieron cargar los roles.'))
      .finally(() => setCargado(true))
  }

  useEffect(load, [])

  // Espejo de roles_guard_escalada (migración 63): un no admin no otorga ni
  // quita permisos solo-admin y no otorga permisos que él mismo no tiene
  // (quitarlos sí). Devuelve el motivo del bloqueo para el title, o null.
  function bloqueoCelda(role: RoleDef, perm: string, on: boolean): string | null {
    if (role.name === 'admin') return 'admin siempre tiene todos los permisos'
    if (isAdmin) return null
    if (PERMISOS_SOLO_ADMIN.includes(perm)) return 'Solo un admin puede otorgar o quitar este permiso'
    if (!on && !misPermisos.includes(perm)) return 'Solo puedes otorgar permisos que tienes'
    return null
  }

  // Marcar/desmarcar un permiso directamente en la celda: optimista, con el
  // array calculado sobre el espejo síncrono y los PATCH encolados por rol.
  function toggleCell(role: RoleDef, perm: string) {
    if (saving) return
    const actual = rolesRef.current.find((r) => r.name === role.name)
    if (!actual) return
    const had = (actual.permissions ?? []).includes(perm)
    if (bloqueoCelda(actual, perm, had)) return
    const next = had
      ? (actual.permissions ?? []).filter((p) => p !== perm)
      : [...(actual.permissions ?? []), perm]
    applyRoles(rolesRef.current.map((r) => (r.name === role.name ? { ...r, permissions: next } : r)))
    setError(null)
    const anterior = saveQueue.current[role.name] ?? Promise.resolve()
    saveQueue.current[role.name] = anterior
      .then(async () => {
        await updateRole(role.name, { permissions: next })
        void logAction(
          'rol.editar',
          (had ? 'Quitó el permiso "' : 'Otorgó el permiso "') +
            (permInfo[perm]?.label ?? perm) +
            '" al rol "' +
            role.name +
            '"',
          'roles',
          role.name
        )
      })
      .catch(() => {
        setError('No se pudo guardar el cambio (¿un permiso solo-admin o uno que no tienes?).')
        load() // volver a la verdad de la base, sin pisar otros cambios en vuelo
      })
  }

  // Un no admin no mueve el rol admin ni los que quedaron por encima de él,
  // ni pone otro por encima (la base lo rechaza: roles_guard_escalada).
  function puedeMover(i: number, dir: 'up' | 'down') {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= roles.length) return false
    if (isAdmin) return true
    const iAdmin = roles.findIndex((r) => r.name === 'admin')
    return i > iAdmin && j > iAdmin
  }

  // Reordenar la jerarquía: sube/baja el rol (mayor position = más alto =
  // define el chip del usuario). Si ningún otro rol comparte las dos
  // posiciones basta intercambiarlas; con empate (createRole deja 0) se
  // renumera, porque la base desempata por nombre y el orden guardado no
  // coincidiría con el que se ve. Solo viajan las filas que cambian.
  // Riesgo aceptado (D-U4-02): los PATCH van en paralelo y no forman una
  // transacción; si uno falla, la jerarquía queda guardada a medias y load()
  // muestra la verdad de la base. El RPC transaccional (una migración 71)
  // queda fuera de la fase 1.10.
  async function move(role: RoleDef, dir: 'up' | 'down') {
    const list = [...roles] // ya viene ordenada por position desc, name
    const idx = list.findIndex((r) => r.name === role.name)
    if (idx < 0 || !puedeMover(idx, dir)) return
    const j = dir === 'up' ? idx - 1 : idx + 1
    const a = list[idx]
    const b = list[j]
    ;[list[idx], list[j]] = [b, a]
    const empate =
      a.position === b.position ||
      roles.some(
        (r) =>
          r.name !== a.name &&
          r.name !== b.name &&
          (r.position === a.position || r.position === b.position)
      )
    // Al renumerar, un admin espacia toda la lista; un no admin deja intacto
    // lo que está hasta la fila admin y cuelga el resto por debajo de su
    // posición (la columna es int: admite negativos).
    const tope = isAdmin ? -1 : list.findIndex((r) => r.name === 'admin')
    const techo = tope < 0 ? (list.length + 1) * 10 : list[tope].position
    const next = empate
      ? list.map((r, i) => (i <= tope ? r : { ...r, position: techo - (i - tope) * 10 }))
      : list.map((r) =>
          r.name === a.name
            ? { ...r, position: b.position }
            : r.name === b.name
              ? { ...r, position: a.position }
              : r
        )
    const antes = new Map(roles.map((r) => [r.name, r.position]))
    const cambian = next.filter((r) => antes.get(r.name) !== r.position)
    setSaving(true)
    setError(null)
    try {
      await Promise.all(cambian.map((r) => updateRole(r.name, { position: r.position })))
      applyRoles(next)
    } catch {
      setError('No se pudo reordenar la jerarquía.')
      load()
    } finally {
      setSaving(false)
    }
  }

  function openDetail(role: RoleDef) {
    if (openRole === role.name) {
      setOpenRole(null)
      return
    }
    setOpenRole(role.name)
    setDetail({
      name: role.name,
      description: role.description ?? '',
      color: role.color ?? DEFAULT_COLOR,
    })
    setError(null)
  }

  async function saveDetail(e: FormEvent) {
    e.preventDefault()
    const role = roles.find((r) => r.name === openRole)
    if (!role) return
    const renaming =
      !role.is_system && !PROTECTED_NAMES.includes(role.name) && detail.name.trim() !== role.name
    if (renaming) {
      const nameError = validateRoleName(detail.name)
      if (nameError) {
        setError(nameError)
        return
      }
      if (NOMBRES_RESERVADOS.includes(detail.name.trim())) {
        setError('Ese nombre está reservado.')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await updateRole(role.name, {
        ...(renaming ? { name: detail.name.trim() } : {}),
        description: detail.description.trim() || null,
        color: detail.color,
      })
      void logAction('rol.editar', 'Editó el rol "' + role.name + '"', 'roles', role.name)
      setOpenRole(null)
      load()
    } catch (err) {
      setError(errorNombre(err, 'No se pudo guardar el rol.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(role: RoleDef) {
    // El FK de user_roles borra en cascada: avisar con el número real
    let asignados = -1
    try {
      asignados = await countRoleMembers(role.name)
    } catch {
      /* sin conteo: aviso genérico */
    }
    const aviso =
      asignados > 0
        ? `¿Eliminar el rol "${role.name}"? ${asignados} miembro(s) lo tienen asignado y lo PERDERÁN al instante, junto con los permisos que les daba.`
        : asignados === 0
          ? `¿Eliminar el rol "${role.name}"? Ningún miembro lo tiene asignado.`
          : `¿Eliminar el rol "${role.name}"? Si algún miembro lo tiene asignado, lo perderá al instante.`
    if (!window.confirm(aviso)) return
    try {
      await deleteRole(role.name)
      void logAction('rol.eliminar', 'Eliminó el rol "' + role.name + '"', 'roles', role.name)
      if (openRole === role.name) setOpenRole(null)
      load()
    } catch {
      setError(
        `No se pudo eliminar "${role.name}". Verifica que ningún miembro tenga ese rol (pestaña Miembros).`
      )
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    const nameError = validateRoleName(newName)
    if (nameError) {
      setError(nameError)
      return
    }
    if (NOMBRES_RESERVADOS.includes(newName.trim())) {
      setError('Ese nombre está reservado.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createRole(newName.trim(), null, [], DEFAULT_COLOR)
      void logAction('rol.crear', 'Creó el rol "' + newName.trim() + '"', 'roles', newName.trim())
      setNewName('')
      load()
    } catch (err) {
      setError(errorNombre(err, 'No se pudo crear el rol.'))
    } finally {
      setSaving(false)
    }
  }

  const colCount = groups.reduce((n, g) => n + g.keys.length, 0) + 2

  // Lo indispensable de la matriz, en el «i» del título (sin leyenda). Para
  // un no admin, además, por qué hay casillas atenuadas: cada una lleva su
  // motivo en el title, que el lector de pantalla lee al enfocarla.
  const ayudaMatriz =
    'Cada casilla otorga un permiso al rol y se guarda al instante; el rol admin los tiene todos. Las columnas de Aplicaciones y Herramientas dan visibilidad si el «Visible para» de esa entrada incluye su clave.' +
    (isAdmin
      ? ''
      : ' Las casillas atenuadas no las puedes cambiar: los permisos solo-admin solo los otorga o quita un admin, y solo puedes otorgar permisos que tienes.')

  return (
    <section>
      <CabeceraAdmin titulo="Permisos por rol" ayuda={ayudaMatriz} />
      {error && <p className="alert">{error}</p>}

      <div className="pmx-wrap">
        <table className="pmx" aria-label="Permisos por rol">
          <thead>
            <tr className="pmx-groups">
              <th></th>
              {groups.map((g) => (
                <th key={g.label} colSpan={g.keys.length}>
                  {g.label}
                </th>
              ))}
              <th></th>
            </tr>
            <tr>
              <th className="pmx-corner">Rol</th>
              {groups.flatMap((g) =>
                g.keys.map((k) => (
                  <th key={k} className="pmx-perm" title={permInfo[k]?.description ?? k}>
                    <span>{permInfo[k]?.label ?? k}</span>
                  </th>
                ))
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!cargado && <SkeletonFilas filas={5} columnas={colCount} />}
            {roles.map((role, i) => {
              const isAdminRole = role.name === 'admin'
              const open = openRole === role.name
              const protegido = PROTECTED_NAMES.includes(role.name)
              // Espejo de roles_guard_escalada al eliminar (migración 63)
              const motivoEliminar =
                isAdmin || role.is_system
                  ? null
                  : protegido
                    ? 'Solo un admin elimina este rol'
                    : llevaSoloAdmin(role)
                      ? 'Solo un admin elimina un rol con permisos sensibles'
                      : null
              const notas: string[] = []
              if (role.is_system) notas.push('Rol de sistema: no se puede renombrar ni eliminar.')
              else if (protegido) notas.push('Se busca por nombre: no se puede renombrar.')
              if (!isAdmin && isAdminRole) notas.push('Solo un admin lo modifica.')
              if (motivoEliminar) notas.push(motivoEliminar + '.')
              return (
                <Fragment key={role.name}>
                  <tr className={open ? 'pmx-open' : undefined}>
                    <td className="pmx-role">
                      <span className="pmx-role-in">
                      <span className="pmx-order">
                        <button
                          className="btn-ghost btn-small"
                          title="Subir en la jerarquía"
                          aria-label={`Subir ${role.name} en la jerarquía`}
                          disabled={saving || !puedeMover(i, 'up')}
                          onClick={() => void move(role, 'up')}
                        >
                          ↑
                        </button>
                        <button
                          className="btn-ghost btn-small"
                          title="Bajar en la jerarquía"
                          aria-label={`Bajar ${role.name} en la jerarquía`}
                          disabled={saving || !puedeMover(i, 'down')}
                          onClick={() => void move(role, 'down')}
                        >
                          ↓
                        </button>
                      </span>
                      <span
                        className="role-chip"
                        style={role.color ? { color: role.color, borderColor: role.color } : undefined}
                      >
                        {role.name}
                      </span>
                      </span>
                    </td>
                    {groups.flatMap((g) =>
                      g.keys.map((k) => {
                        const on = isAdminRole || (role.permissions ?? []).includes(k)
                        const bloqueo = bloqueoCelda(role, k, on)
                        // Bloqueada: aria-disabled y no disabled, para que
                        // siga recibiendo el foco y el lector lea el motivo
                        // del title (toggleCell ya la ignora)
                        return (
                          <td key={k} className="pmx-cellbox">
                            <button
                              type="button"
                              className="pmx-cell"
                              data-on={on ? '1' : '0'}
                              aria-pressed={on}
                              aria-label={`${permInfo[k]?.label ?? k} en ${role.name}`}
                              title={bloqueo ?? permInfo[k]?.label ?? k}
                              aria-disabled={bloqueo ? true : undefined}
                              onClick={() => void toggleCell(role, k)}
                            />
                          </td>
                        )
                      })
                    )}
                    <td className="pmx-actions">
                      <button
                        className="btn-ghost btn-small"
                        aria-expanded={open}
                        aria-label={`${open ? 'Cerrar' : 'Abrir'} el detalle de ${role.name}`}
                        onClick={() => openDetail(role)}
                      >
                        {open ? 'Cerrar' : 'Detalle'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="pmx-detail">
                      <td colSpan={colCount}>
                        <form className="pmx-detail-form" onSubmit={saveDetail}>
                          <label className="form-field">
                            <span className="form-label">Nombre</span>
                            <input
                              value={detail.name}
                              disabled={role.is_system || protegido}
                              title={
                                protegido
                                  ? 'Los avisos o las cuentas de servicio buscan este rol por nombre: no se puede renombrar'
                                  : undefined
                              }
                              onChange={(e) => setDetail({ ...detail, name: e.target.value })}
                            />
                          </label>
                          <label className="form-field pmx-detail-desc">
                            <span className="form-label">Descripción</span>
                            <input
                              value={detail.description}
                              onChange={(e) => setDetail({ ...detail, description: e.target.value })}
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">Color</span>
                            <span className="color-field">
                              <input
                                type="color"
                                value={detail.color}
                                onChange={(e) => setDetail({ ...detail, color: e.target.value })}
                                title="Color del rol (define el chip del usuario)"
                              />
                              <span
                                className="role-chip"
                                style={{ color: detail.color, borderColor: detail.color }}
                              >
                                {detail.name.trim() || 'rol'}
                              </span>
                            </span>
                          </label>
                          <div className="form-actions">
                            <button
                              className="btn-primary btn-small"
                              type="submit"
                              disabled={saving || (!isAdmin && isAdminRole)}
                              title={!isAdmin && isAdminRole ? 'Solo un admin modifica el rol admin' : undefined}
                            >
                              {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                            <span className="pmx-order-detail">
                              <button
                                className="btn-ghost btn-small"
                                type="button"
                                disabled={saving || !puedeMover(i, 'up')}
                                onClick={() => void move(role, 'up')}
                              >
                                Subir
                              </button>
                              <button
                                className="btn-ghost btn-small"
                                type="button"
                                disabled={saving || !puedeMover(i, 'down')}
                                onClick={() => void move(role, 'down')}
                              >
                                Bajar
                              </button>
                            </span>
                            {!role.is_system && (
                              <button
                                className="btn-danger btn-small"
                                type="button"
                                disabled={!!motivoEliminar}
                                title={motivoEliminar ?? undefined}
                                onClick={() => void remove(role)}
                              >
                                Eliminar rol
                              </button>
                            )}
                            {/* Estado del rol: por qué no se renombra, no se
                                guarda o no se elimina (los botones
                                deshabilitados no reciben foco) */}
                            {notas.length > 0 && <span className="muted small">{notas.join(' ')}</span>}
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <form className="pmx-new" onSubmit={create}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="nombre-del-rol"
          maxLength={40}
          aria-label="Nombre del rol nuevo"
        />
        {/* Ghost: con un detalle abierto, su «Guardar» es el único primario */}
        <button className="btn-ghost btn-small" type="submit" disabled={saving || !newName.trim()}>
          Añadir rol
        </button>
      </form>
    </section>
  )
}
