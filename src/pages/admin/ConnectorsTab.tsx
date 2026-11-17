import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import CabeceraAdmin from './CabeceraAdmin'
import {
  createConnector,
  deleteConnector,
  fetchAllConnectors,
  fetchRoles,
  toolPermKey,
  updateConnector,
  validateUrl,
  type ConnectorInput,
} from '../../lib/data'
import type { Connector, Role } from '../../types'
import AppIcon from '../../components/AppIcon'
import InfoI from '../../components/InfoI'
import { AVISO_ICONO_PROPIO, tieneIconoPropio } from '../../lib/iconos-apps'
import { SkeletonFilas } from '../../components/Skeleton'
import { logAction } from '../../lib/audit'
import RolesField from './RolesField'

const EMPTY: ConnectorInput = {
  name: '',
  description: null,
  url: '',
  icon: null,
  category: null,
  roles: null,
  active: true,
  sort_order: 0,
}

export default function ConnectorsTab() {
  // null = cargando (skeleton), [] = sin herramientas
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  const [roleNames, setRoleNames] = useState<string[]>([])
  const [form, setForm] = useState<ConnectorInput>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Fallo de carga aparte: «error» es del formulario (Editar y Cancelar lo
  // limpian) y con la lista vacía por error no se pinta el vacío
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  // Fallo de Activar/Desactivar o Eliminar: va fuera del formulario, que
  // casi siempre está cerrado
  const [errorFila, setErrorFila] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // El formulario se abre con «Nueva herramienta» o «Editar»; al cerrarlo el
  // foco vuelve a quien lo abrió (o a «Nueva herramienta» si esa fila ya no está)
  const [mostrarForm, setMostrarForm] = useState(false)
  const primerCampo = useRef<HTMLInputElement>(null)
  const btnNuevo = useRef<HTMLButtonElement>(null)
  const retorno = useRef<HTMLElement | null>(null)
  // Tras eliminar, la fila (y su botón) desaparece: el foco va a «Nueva herramienta»
  const focoTrasBorrar = useRef(false)
  const avisoCarga = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (mostrarForm) primerCampo.current?.focus()
  }, [mostrarForm, editingId])

  useEffect(() => {
    if (!focoTrasBorrar.current) return
    focoTrasBorrar.current = false
    ;(btnNuevo.current ?? primerCampo.current)?.focus()
  }, [connectors])

  useEffect(() => {
    if (mostrarForm || !retorno.current) return
    ;(retorno.current.isConnected ? retorno.current : btnNuevo.current)?.focus()
    retorno.current = null
  }, [mostrarForm])

  function load() {
    fetchAllConnectors()
      .then((c) => {
        setConnectors(c)
        setErrorCarga(null)
      })
      .catch(() => {
        const fallo = () => {
          setConnectors((c) => c ?? [])
          setErrorCarga('No se pudieron cargar las herramientas.')
        }
        if (!focoTrasBorrar.current) return fallo()
        // Recarga fallida tras eliminar: la lista no cambia y el efecto de
        // arriba no corre. El foco va al aviso, que tiene que estar pintado
        focoTrasBorrar.current = false
        flushSync(fallo)
        avisoCarga.current?.focus()
      })
    fetchRoles()
      .then((r) => setRoleNames(r.map((x) => x.name)))
      .catch(() => setRoleNames(['admin', 'editor', 'member']))
  }

  useEffect(load, [])

  function set<K extends keyof ConnectorInput>(key: K, value: ConnectorInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function nueva(e: MouseEvent<HTMLElement>) {
    retorno.current = e.currentTarget
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
    setMostrarForm(true)
  }

  function startEdit(connector: Connector, e: MouseEvent<HTMLElement>) {
    const { id, ...rest } = connector
    retorno.current = e.currentTarget
    setEditingId(id)
    setForm(rest)
    setError(null)
    setMostrarForm(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
    setMostrarForm(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const nameError = form.name.trim() ? null : 'El nombre es obligatorio'
    const urlError = validateUrl(form.url)
    const firstError = nameError ?? urlError
    if (firstError) {
      setError(firstError)
      return
    }

    setSaving(true)
    setError(null)
    const payload: ConnectorInput = {
      ...form,
      name: form.name.trim(),
      url: form.url.trim(),
      description: form.description?.trim() || null,
      icon: form.icon?.trim() || null,
      category: form.category?.trim() || null,
      roles: form.roles && form.roles.length > 0 ? form.roles : null,
    }
    try {
      if (editingId) await updateConnector(editingId, payload)
      else await createConnector(payload)
      void logAction(
        editingId ? 'herramienta.editar' : 'herramienta.crear',
        `${editingId ? 'Editó' : 'Creó'} la herramienta "${payload.name}"`,
        'connectors',
        payload.name
      )
      cancelEdit()
      load()
    } catch {
      setError('No se pudo guardar la herramienta.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(connector: Connector) {
    setErrorFila(null)
    try {
      await updateConnector(connector.id, { active: !connector.active })
      void logAction(
        'herramienta.estado',
        `${connector.active ? 'Desactivó' : 'Activó'} la herramienta "${connector.name}"`,
        'connectors',
        connector.name
      )
      load()
    } catch {
      setErrorFila(`No se pudo cambiar el estado de "${connector.name}".`)
    }
  }

  async function remove(connector: Connector) {
    if (
      !window.confirm(
        `¿Eliminar "${connector.name}"? Esta acción no se puede deshacer.`
      )
    )
      return
    setErrorFila(null)
    try {
      await deleteConnector(connector.id)
      void logAction(
        'herramienta.eliminar',
        `Eliminó la herramienta "${connector.name}"`,
        'connectors',
        connector.name
      )
      focoTrasBorrar.current = true
      if (editingId === connector.id) {
        retorno.current = null
        cancelEdit()
      }
      load()
    } catch {
      setErrorFila(`No se pudo eliminar "${connector.name}".`)
    }
  }

  return (
    <section>
      <CabeceraAdmin titulo="Herramientas del equipo">
        {!mostrarForm && (
          <button ref={btnNuevo} type="button" className="btn-primary btn-small" onClick={nueva}>
            Nueva herramienta
          </button>
        )}
      </CabeceraAdmin>
      {mostrarForm && (
        <form className="admin-form" onSubmit={submit}>
          <h3>{editingId ? 'Editar herramienta' : 'Nueva herramienta'}</h3>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Nombre</span>
              <input
                ref={primerCampo}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                name="bl-herramienta-nombre"
                autoComplete="off"
                placeholder="Nombre de la herramienta"
              />
            </label>
            <label className="form-field">
              <span className="form-label">URL</span>
              <input
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                name="bl-herramienta-url"
                autoComplete="off"
                placeholder="https://…"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Categoría</span>
              <input
                value={form.category ?? ''}
                onChange={(e) => set('category', e.target.value)}
                name="bl-herramienta-categoria"
                autoComplete="off"
                placeholder="Ej. Gestión"
              />
            </label>
            <div className="form-field">
              <span className="admin-etiqueta">
                <label className="form-label" htmlFor="herr-icono">
                  Icono (ruta de imagen)
                </label>
                {tieneIconoPropio(toolPermKey(form.name)) && <InfoI texto={AVISO_ICONO_PROPIO} />}
              </span>
              <input
                id="herr-icono"
                name="bl-herramienta-icono"
                autoComplete="off"
                value={form.icon ?? ''}
                onChange={(e) => set('icon', e.target.value)}
                placeholder="/icons/herramienta.svg"
              />
            </div>
            <label className="form-field form-field-wide">
              <span className="form-label">Descripción</span>
              <input
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
                name="bl-herramienta-descripcion"
                autoComplete="off"
                placeholder="Para qué usa el equipo esta herramienta"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Orden</span>
              <input autoComplete="off"
                type="number"
                value={form.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
              />
            </label>
            <RolesField
              value={form.roles ?? []}
              onChange={(roles: Role[]) => set('roles', roles)}
              available={
                form.name.trim()
                  ? [...roleNames, toolPermKey(form.name)]
                  : roleNames
              }
            />
          </div>
          {error && <p className="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear herramienta'}
            </button>
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {errorCarga && (
        <p ref={avisoCarga} className="alert" tabIndex={-1}>
          {errorCarga}
        </p>
      )}
      {errorFila && (
        <p className="alert" role="alert">
          {errorFila}
        </p>
      )}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {connectors === null && <SkeletonFilas columnas={4} />}
            {connectors?.map((c) => (
              <tr key={c.id} className={c.active ? '' : 'row-inactive'}>
                <td className="cell-icon-name">
                  <AppIcon icon={c.icon} clave={toolPermKey(c.name)} size="sm" /> {c.name}
                </td>
                <td>{c.category ?? '—'}</td>
                <td>{c.active ? 'Activa' : 'Inactiva'}</td>
                <td className="actions">
                  <button className="btn-ghost btn-small" onClick={(e) => startEdit(c, e)}>
                    Editar
                  </button>
                  <button className="btn-ghost btn-small" onClick={() => toggleActive(c)}>
                    {c.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className="btn-danger btn-small" onClick={() => remove(c)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {connectors?.length === 0 && !errorCarga && (
              <tr>
                <td colSpan={4} className="muted">
                  No hay herramientas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
