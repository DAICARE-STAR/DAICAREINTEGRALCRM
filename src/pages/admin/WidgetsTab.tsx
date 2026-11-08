import { useEffect, useState, type FormEvent } from 'react'
import CabeceraAdmin from './CabeceraAdmin'
import { fetchAllWidgets, fetchRoles, updateWidget } from '../../lib/data'
import { SkeletonFilas } from '../../components/Skeleton'
import { logAction } from '../../lib/audit'
import { esWidgetId } from '../../lib/widgets'
import { useInstalacion } from '../../context/InstalacionContext'
import { filtrarWidgets } from '../../lib/modulos'
import type { PortalWidget, Role } from '../../types'
import RolesField from './RolesField'

// Gestión de los widgets del inicio (tabla portal_widgets, migración 30).
// Los widgets nacen en el código del Dashboard: aquí no se crean ni se
// eliminan — se decide cuáles están disponibles para el equipo, para qué
// roles y en qué orden. Cada quien puede además ocultarse los suyos desde
// el botón «Widgets» del inicio y acomodarlos arrastrándolos: desde que
// alguien mueve una tarjeta (preferencia v3, lib/widgetsPrefs.ts), el orden
// de aquí deja de aplicarle y sus widgets nuevos se suman al final. Las filas que el Inicio ya no pinta
// ('ponderado', 'proyectos') no se listan.

export default function WidgetsTab() {
  // null = cargando (skeleton), [] = tabla sin sembrar
  const { activos } = useInstalacion()
  const [widgets, setWidgets] = useState<PortalWidget[] | null>(null)
  const [roleNames, setRoleNames] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<PortalWidget, 'id'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function load() {
    fetchAllWidgets()
      .then((w) => {
        setWidgets(w.filter((x) => esWidgetId(x.id)))
        setError(null)
      })
      .catch(() => {
        setWidgets((w) => w ?? [])
        setError('No se pudieron cargar los widgets. ¿Está aplicada la migración 30?')
      })
    fetchRoles()
      .then((r) => setRoleNames(r.map((x) => x.name)))
      .catch(() => setRoleNames(['admin', 'editor', 'member']))
  }

  useEffect(load, [])

  function startEdit(w: PortalWidget) {
    const { id, ...rest } = w
    setEditingId(id)
    setForm(rest)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(null)
    setError(null)
  }

  function set<K extends keyof Omit<PortalWidget, 'id'>>(
    key: K,
    value: Omit<PortalWidget, 'id'>[K]
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!editingId || !form) return
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateWidget(editingId, {
        name: form.name.trim(),
        description: form.description?.trim() || '',
        roles: form.roles && form.roles.length > 0 ? form.roles : null,
        sort_order: form.sort_order,
        active: form.active,
      })
      void logAction(
        'widget.editar',
        `Editó el widget "${form.name.trim()}"`,
        'portal_widgets',
        editingId
      )
      cancelEdit()
      load()
    } catch {
      setError('No se pudo guardar el widget.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(w: PortalWidget) {
    try {
      await updateWidget(w.id, { active: !w.active })
      void logAction(
        'widget.estado',
        `${w.active ? 'Desactivó' : 'Activó'} el widget "${w.name}"`,
        'portal_widgets',
        w.id
      )
      load()
    } catch {
      setError('No se pudo cambiar el estado.')
    }
  }

  return (
    <section>
      <CabeceraAdmin titulo="Widgets del inicio" />
      {editingId && form && (
        <form className="admin-form" onSubmit={submit}>
          <h3>Editar widget</h3>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Nombre</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="form-field">
              <span className="form-label">Orden</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
              />
            </label>
            <label className="form-field form-field-wide">
              <span className="form-label">Descripción</span>
              <input
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
              />
            </label>
            <RolesField
              value={form.roles ?? []}
              onChange={(roles: Role[]) => set('roles', roles)}
              available={roleNames}
            />
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!editingId && error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Widget</th>
              <th>Roles</th>
              <th>Orden</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {widgets === null && <SkeletonFilas columnas={5} />}
            {(widgets && filtrarWidgets(widgets, activos))?.map((w) => (
              <tr key={w.id} className={w.active ? '' : 'row-inactive'}>
                <td>
                  <strong>{w.name}</strong>
                  {w.description && <div className="muted small">{w.description}</div>}
                </td>
                <td>{w.roles && w.roles.length > 0 ? w.roles.join(', ') : 'Todos'}</td>
                <td>{w.sort_order}</td>
                <td>{w.active ? 'Disponible' : 'Retirado'}</td>
                <td className="actions">
                  <button className="btn-ghost btn-small" onClick={() => startEdit(w)}>
                    Editar
                  </button>
                  <button className="btn-ghost btn-small" onClick={() => void toggleActive(w)}>
                    {w.active ? 'Retirar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {widgets?.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="muted">
                  Sin widgets registrados. Ejecuta la migración 30 para sembrarlos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
