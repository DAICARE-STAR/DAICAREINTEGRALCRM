import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../../components/Avatar'
import InfoI from '../../components/InfoI'
import CabeceraAdmin from './CabeceraAdmin'
import { SkeletonFilas, SkeletonTarjetas } from '../../components/Skeleton'
import { fetchAllApps, fetchApps } from '../../lib/data'
import { supabase } from '../../lib/supabase'
import { relativeSeen } from '../../lib/team'
import {
  fmtDuracion,
  rangoPeriodo,
  resumirUso,
  type FilaAccion,
  type FilaUso,
  type UsoMiembro,
} from '../../lib/uso'

// Uso del portal por miembro (migración 73): minutos con el portal visible
// y actividad reciente, por app, más las acciones de audit_log. Solo
// administradores (decisión del usuario, 2026-10-09); el detalle se guarda
// 90 días. Las cuentas de servicio se excluyen salvo que se pidan.

interface Perfil {
  id: string
  full_name: string | null
  avatar_url: string | null
}
interface AppNombre {
  slug: string
  name: string
}
interface FilaDia {
  dia: string
  minutos: number
  aperturas: number
}
interface AuditEntry {
  id: number
  action: string
  detail: string
  created_at: string
}

type Orden = 'minutos' | 'dias' | 'acciones'
const PERIODOS = [7, 30, 90] as const
const PAGE = 200
const AYUDA_TIEMPO =
  'Minutos con el portal en primer plano y actividad (teclado, ratón o scroll) en los últimos 5 minutos, también dentro de las apps. Se guarda 90 días.'

const fmtN = (n: number) => n.toLocaleString('es-CO')
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}
function esFaltaMigracion(mensaje: string, code?: string): boolean {
  return code === 'PGRST202' || code === '42883' || code === '42P01' || /does not exist|schema cache/i.test(mensaje)
}

export default function UsoTab() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30)
  const [conServicio, setConServicio] = useState(false)
  // null = cargando
  const [filas, setFilas] = useState<FilaUso[] | null>(null)
  const [acciones, setAcciones] = useState<FilaAccion[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [apps, setApps] = useState<AppNombre[]>([])
  const [servicio, setServicio] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('minutos')
  const [elegido, setElegido] = useState<string | null>(null)
  const botonVerRef = useRef<HTMLButtonElement | null>(null)
  const tituloPerfilRef = useRef<HTMLHeadingElement | null>(null)

  const rango = useMemo(() => rangoPeriodo(dias), [dias])

  useEffect(() => {
    let cancelado = false
    setFilas(null)
    setError(null)
    void (async () => {
      const [uso, acc, perf, catalogo, svc] = await Promise.all([
        supabase.rpc('uso_resumen', { p_desde: rango.desde, p_hasta: rango.hasta }),
        supabase.rpc('acciones_resumen', { p_desde: rango.desde, p_hasta: rango.hasta }),
        supabase.from('profiles').select('id, full_name, avatar_url'),
        fetchAllApps().catch(() => fetchApps()).catch(() => [] as AppNombre[]),
        supabase.rpc('cuentas_servicio_ids').then((r) => (r.error ? [] : ((r.data ?? []) as string[]))),
      ])
      if (cancelado) return
      if (uso.error) {
        setError(
          esFaltaMigracion(uso.error.message, uso.error.code)
            ? 'Falta ejecutar la migración 73 en Supabase (migration-73-uso-portal.sql).'
            : 'No se pudo cargar el uso del portal.'
        )
        setFilas([])
        return
      }
      setFilas((uso.data ?? []) as FilaUso[])
      setAcciones(acc.error ? [] : ((acc.data ?? []) as FilaAccion[]))
      setPerfiles(perf.error ? [] : ((perf.data ?? []) as Perfil[]))
      setApps((catalogo as AppNombre[]).map((a) => ({ slug: a.slug, name: a.name })))
      setServicio(svc)
    })()
    return () => {
      cancelado = true
    }
  }, [rango])

  const resumen = useMemo(
    () => resumirUso(filas ?? [], acciones, apps, { excluir: conServicio ? [] : servicio }),
    [filas, acciones, apps, conServicio, servicio]
  )
  const nombreDe = (id: string) => perfiles.find((p) => p.id === id)?.full_name || id.slice(0, 8)
  const avatarDe = (id: string) => perfiles.find((p) => p.id === id)?.avatar_url ?? null

  const miembros = useMemo(() => {
    const lista = [...resumen.miembros]
    lista.sort((a, b) => b[orden] - a[orden] || b.minutos - a.minutos || nombreDe(a.userId).localeCompare(nombreDe(b.userId), 'es'))
    return lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumen, orden, perfiles])

  const perfilElegido = elegido ? resumen.miembros.find((m) => m.userId === elegido) ?? null : null
  useEffect(() => {
    if (perfilElegido) tituloPerfilRef.current?.focus()
  }, [perfilElegido])

  if (error) return <p className="alert">{error}</p>

  const encabezado = (clave: Orden, texto: string) => (
    <th aria-sort={orden === clave ? 'descending' : 'none'}>
      <button type="button" className="uso-orden" aria-pressed={orden === clave} onClick={() => setOrden(clave)}>
        {texto}
      </button>
    </th>
  )

  return (
    <section>
      <CabeceraAdmin titulo="Uso del portal">
        <select
          className="select"
          aria-label="Periodo"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value) as (typeof PERIODOS)[number])}
        >
          {PERIODOS.map((d) => (
            <option key={d} value={d}>
              Últimos {d} días
            </option>
          ))}
        </select>
        <label className="form-check">
          <input type="checkbox" checked={conServicio} onChange={(e) => setConServicio(e.target.checked)} />{' '}
          Incluir cuentas de servicio
        </label>
      </CabeceraAdmin>

      {filas ? (
        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-label">
              Tiempo del equipo
              <InfoI texto={AYUDA_TIEMPO} />
            </span>
            <span className="stat-value">{fmtDuracion(resumen.minutosEquipo)}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Miembros activos</span>
            <span className="stat-value">{fmtN(resumen.activos)}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">App más usada</span>
            <span className="stat-value">
              {resumen.appMasUsada ? resumen.appMasUsada.nombre : '—'}
              {resumen.appMasUsada && (
                <span className="muted small"> · {fmtDuracion(resumen.appMasUsada.minutos)}</span>
              )}
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Acciones</span>
            <span className="stat-value">{fmtN(resumen.accionesEquipo)}</span>
          </div>
        </div>
      ) : (
        <SkeletonTarjetas n={4} anunciar={false} />
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Miembro</th>
              {encabezado('minutos', 'Tiempo')}
              {encabezado('dias', 'Días activos')}
              <th>Última actividad</th>
              <th>Apps principales</th>
              {encabezado('acciones', 'Acciones')}
              <th>
                <span className="sr-only">Detalle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas === null && <SkeletonFilas filas={5} columnas={7} />}
            {filas && miembros.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Aún no hay uso registrado en este periodo.
                </td>
              </tr>
            )}
            {miembros.map((m) => (
              <tr key={m.userId}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Avatar url={avatarDe(m.userId)} name={nombreDe(m.userId)} size={28} />
                    {nombreDe(m.userId)}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDuracion(m.minutos)}</td>
                <td>{fmtN(m.dias)}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {m.ultima ? relativeSeen(m.ultima) : '—'}
                </td>
                <td className="muted small">
                  {m.apps
                    .slice(0, 3)
                    .map((a) => `${a.nombre} ${fmtDuracion(a.minutos)}`)
                    .join(' · ') || '—'}
                </td>
                <td>{fmtN(m.acciones)}</td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    aria-expanded={elegido === m.userId}
                    onClick={(e) => {
                      botonVerRef.current = e.currentTarget
                      setElegido(m.userId)
                    }}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {perfilElegido && (
        <PerfilUso
          miembro={perfilElegido}
          nombre={nombreDe(perfilElegido.userId)}
          avatar={avatarDe(perfilElegido.userId)}
          desde={rango.desde}
          hasta={rango.hasta}
          tituloRef={tituloPerfilRef}
          onCerrar={() => {
            setElegido(null)
            botonVerRef.current?.focus()
          }}
        />
      )}
    </section>
  )
}

function Barras({ items, max }: { items: { etiqueta: string; valor: number; texto: string }[]; max: number }) {
  return (
    <ul className="uso-barras">
      {items.map((it) => (
        <li key={it.etiqueta}>
          <span>{it.etiqueta}</span>
          <span className="uso-barra" aria-hidden="true">
            <i style={{ width: `${max > 0 ? Math.round((it.valor / max) * 100) : 0}%` }} />
          </span>
          <span className="valor">{it.texto}</span>
        </li>
      ))}
    </ul>
  )
}

function PerfilUso({
  miembro,
  nombre,
  avatar,
  desde,
  hasta,
  tituloRef,
  onCerrar,
}: {
  miembro: UsoMiembro
  nombre: string
  avatar: string | null
  desde: string
  hasta: string
  tituloRef: React.RefObject<HTMLHeadingElement>
  onCerrar: () => void
}) {
  const [porDia, setPorDia] = useState<FilaDia[] | null>(null)
  const [porTipo, setPorTipo] = useState<FilaAccion[] | null>(null)
  const [entradas, setEntradas] = useState<AuditEntry[] | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)

  async function cargarEntradas(before?: number) {
    let q = supabase
      .from('audit_log')
      .select('id, action, detail, created_at')
      .eq('user_id', miembro.userId)
      .gte('created_at', `${desde}T00:00:00`)
      .order('id', { ascending: false })
      .limit(PAGE)
    if (before !== undefined) q = q.lt('id', before)
    const { data, error } = await q
    if (error) {
      setEntradas((prev) => prev ?? [])
      return
    }
    const filas = (data ?? []) as AuditEntry[]
    setEntradas((prev) => (before === undefined || !prev ? filas : [...prev, ...filas]))
    setHayMas(filas.length === PAGE)
  }

  useEffect(() => {
    let cancelado = false
    setPorDia(null)
    setPorTipo(null)
    setEntradas(null)
    void Promise.all([
      supabase.rpc('uso_detalle_usuario', { p_user: miembro.userId, p_desde: desde, p_hasta: hasta }),
      supabase.rpc('acciones_resumen', { p_desde: desde, p_hasta: hasta, p_user: miembro.userId }),
    ]).then(([d, a]) => {
      if (cancelado) return
      setPorDia(d.error ? [] : ((d.data ?? []) as FilaDia[]))
      setPorTipo(a.error ? [] : ((a.data ?? []) as FilaAccion[]))
    })
    void cargarEntradas()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miembro.userId, desde, hasta])

  const maxApp = Math.max(0, ...miembro.apps.map((a) => a.minutos))
  const maxDia = Math.max(0, ...(porDia ?? []).map((d) => d.minutos))

  return (
    <section className="uso-perfil" aria-labelledby="uso-perfil-titulo">
      <div className="widget-head">
        <h2 id="uso-perfil-titulo" ref={tituloRef} tabIndex={-1}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Avatar url={avatar} name={nombre} size={32} />
            {nombre}
          </span>
        </h2>
        <button type="button" className="btn-ghost btn-small" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Tiempo</span>
          <span className="stat-value">{fmtDuracion(miembro.minutos)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Días activos</span>
          <span className="stat-value">{fmtN(miembro.dias)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Aperturas</span>
          <span className="stat-value">{fmtN(miembro.aperturas)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Acciones</span>
          <span className="stat-value">{fmtN(miembro.acciones)}</span>
        </div>
      </div>

      <h3>Por app</h3>
      {miembro.apps.length ? (
        <Barras
          max={maxApp}
          items={miembro.apps.map((a) => ({
            etiqueta: a.nombre,
            valor: a.minutos,
            texto: `${fmtDuracion(a.minutos)} · ${fmtN(a.aperturas)} ${a.aperturas === 1 ? 'apertura' : 'aperturas'}`,
          }))}
        />
      ) : (
        <p className="muted small">Sin tiempo registrado en este periodo.</p>
      )}

      <h3>Por día</h3>
      {porDia === null ? (
        <SkeletonTarjetas n={1} anunciar={false} />
      ) : porDia.length ? (
        <Barras
          max={maxDia}
          items={porDia.map((d) => ({ etiqueta: fmtDia(d.dia), valor: d.minutos, texto: fmtDuracion(d.minutos) }))}
        />
      ) : (
        <p className="muted small">Sin días con uso en este periodo.</p>
      )}

      <h3>Acciones por tipo</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Acción</th>
            <th>Veces</th>
          </tr>
        </thead>
        <tbody>
          {porTipo === null && <SkeletonFilas filas={3} columnas={2} />}
          {porTipo?.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                Sin acciones registradas en este periodo.
              </td>
            </tr>
          )}
          {porTipo?.map((t) => (
            <tr key={t.action}>
              <td>
                <code>{t.action}</code>
              </td>
              <td>{fmtN(t.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Línea de tiempo</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Acción</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {entradas === null && <SkeletonFilas filas={4} columnas={3} />}
          {entradas?.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Sin acciones en este periodo.
              </td>
            </tr>
          )}
          {entradas?.map((e) => (
            <tr key={e.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {fmtFecha(e.created_at)}
              </td>
              <td>
                <code>{e.action}</code>
              </td>
              <td>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hayMas && (
        <div className="form-actions" style={{ marginTop: '0.8rem' }}>
          <button
            type="button"
            className="btn-ghost"
            disabled={cargandoMas}
            onClick={() => {
              if (!entradas?.length) return
              setCargandoMas(true)
              void cargarEntradas(entradas[entradas.length - 1].id).finally(() => setCargandoMas(false))
            }}
          >
            {cargandoMas ? 'Cargando…' : 'Cargar más antiguas'}
          </button>
        </div>
      )}
    </section>
  )
}
