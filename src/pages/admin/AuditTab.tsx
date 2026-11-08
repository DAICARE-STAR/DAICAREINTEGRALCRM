import { useEffect, useMemo, useState } from 'react'
import CabeceraAdmin from './CabeceraAdmin'
import { SkeletonFilas } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'

interface AuditEntry {
  id: number
  user_email: string
  action: string
  detail: string
  entity: string
  entity_id: string
  created_at: string
}

const PAGE = 200

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AuditTab() {
  // null = cargando (skeleton), [] = sin acciones registradas
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [filtro, setFiltro] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  async function load(before?: number) {
    let query = supabase
      .from('audit_log')
      .select('id, user_email, action, detail, entity, entity_id, created_at')
      .order('id', { ascending: false })
      .limit(PAGE)
    if (before !== undefined) query = query.lt('id', before)
    const { data, error: err } = await query
    if (err) {
      setEntries((prev) => prev ?? [])
      setError('No se pudo cargar el registro (¿migración 18 ejecutada?).')
      return
    }
    const rows = (data ?? []) as AuditEntry[]
    setEntries((prev) => (before === undefined || !prev ? rows : [...prev, ...rows]))
    setHasMore(rows.length === PAGE)
  }

  useEffect(() => {
    void load()
  }, [])

  async function loadMore() {
    if (!entries?.length) return
    setLoadingMore(true)
    await load(entries[entries.length - 1].id)
    setLoadingMore(false)
  }

  const visibles = useMemo(() => {
    if (!entries) return null
    const q = filtro.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.user_email.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q)
    )
  }, [entries, filtro])

  return (
    <section>
      <CabeceraAdmin titulo="Registro de acciones">
        <label className="form-field admin-cabecera-buscar">
          <span className="sr-only">Buscar (usuario, acción o detalle)</span>
          <input
            type="search"
            autoComplete="off"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar usuario, acción o detalle"
          />
        </label>
      </CabeceraAdmin>

      {error && <p className="alert">{error}</p>}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibles === null && <SkeletonFilas columnas={4} />}
            {visibles?.map((e) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {fmtFecha(e.created_at)}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.user_email.split('@')[0]}</td>
                <td>
                  <code>{e.action}</code>
                </td>
                <td>{e.detail}</td>
              </tr>
            ))}
            {visibles?.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="muted">
                  {filtro
                    ? 'Sin coincidencias con la búsqueda.'
                    : 'Aún no hay acciones registradas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && !filtro && (
        <div className="form-actions" style={{ marginTop: '0.8rem' }}>
          <button className="btn-ghost" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más antiguas'}
          </button>
        </div>
      )}
    </section>
  )
}
