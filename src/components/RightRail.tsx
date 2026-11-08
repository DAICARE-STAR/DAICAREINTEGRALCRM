import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { usePresence } from '../context/PresenceContext'
import { fetchTeamMembers } from '../lib/calendar'
import { supabase } from '../lib/supabase'
import type { TeamMember } from '../types'
import Avatar from './Avatar'
import { IconoEquipo } from './IconosNav'
import NotifBell from './NotifBell'
import NotifSections from './NotifSections'
import ProfileCard, { type ProfileCardMember } from './ProfileCard'
import { SkeletonLista } from './Skeleton'

// Barra lateral derecha estilo Discord: miembros del equipo con su estado
// de presencia + notificaciones (secciones compartidas con la campana del
// topbar móvil vía NotificationsContext). Persistente en el shell; se
// oculta en pantallas angostas (ver CSS). Los desconectados van plegados
// bajo «N desconectados»; lo abierto o cerrado se recuerda en este navegador.
// Contraída (`compacta`, estado de Layout) queda en una columna de iconos:
// la campana con sus notificaciones y los avatares de quienes están
// conectados; los desconectados y las secciones de avisos no se muestran, y
// si el equipo no carga queda un indicador con `title` en vez del texto.

type Estado = 'online' | 'away' | 'offline'

const ESTADO_LABEL: Record<Estado, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
}

const DESCONECTADOS_KEY = 'pt_rail_desconectados_v1'

export default function RightRail({
  compacta,
  alAlternar,
}: {
  compacta: boolean
  alAlternar: () => void
}) {
  const { presence } = usePresence()
  // null = cargando (skeleton); [] = sin miembros o error
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [errorEquipo, setErrorEquipo] = useState(false)
  const [verDesconectados, setVerDesconectados] = useState(() => {
    try {
      return localStorage.getItem(DESCONECTADOS_KEY) === '1'
    } catch {
      return false
    }
  })
  // Tarjeta de perfil flotante del miembro pulsado
  const [card, setCard] = useState<{ member: ProfileCardMember; x: number; y: number } | null>(null)

  // Recarga antirrebote: varios cambios seguidos disparan una sola consulta
  const teamTimer = useRef<number | undefined>(undefined)

  function loadTeam() {
    fetchTeamMembers()
      .then((t) => {
        setTeam(t)
        setErrorEquipo(false)
      })
      .catch(() => {
        // Una recarga fallida no borra la lista que ya se ve
        setTeam((prev) => prev ?? [])
        setErrorEquipo(true)
      })
  }

  function alternarDesconectados() {
    setVerDesconectados((v) => {
      try {
        localStorage.setItem(DESCONECTADOS_KEY, v ? '0' : '1')
      } catch {
        /* sin almacenamiento: solo estado en memoria */
      }
      return !v
    })
  }

  useEffect(() => {
    loadTeam()

    // Realtime: la barra reacciona a cambios de perfil del equipo sin
    // recargar. Si la tabla no está en la publicación, el canal no emite.
    const debouncedTeam = () => {
      window.clearTimeout(teamTimer.current)
      teamTimer.current = window.setTimeout(loadTeam, 400)
    }
    const channel = supabase
      .channel('rail-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedTeam)
      .subscribe()

    return () => {
      window.clearTimeout(teamTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [])

  function estadoDe(id: string): Estado {
    const p = presence[id]
    if (!p) return 'offline'
    return p.state === 'online' ? 'online' : 'away'
  }

  const ordenado = useMemo(() => {
    const rank: Record<Estado, number> = { online: 0, away: 1, offline: 2 }
    return [...(team ?? [])].sort((a, b) => {
      const d = rank[estadoDe(a.id)] - rank[estadoDe(b.id)]
      return d !== 0 ? d : (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, presence])

  const conectados = ordenado.filter((m) => estadoDe(m.id) !== 'offline')
  const desconectados = ordenado.filter((m) => estadoDe(m.id) === 'offline')
  const online = ordenado.filter((m) => estadoDe(m.id) === 'online').length

  function fila(m: TeamMember) {
    const estado = estadoDe(m.id)
    const nombre = m.full_name ?? 'Sin nombre'
    return (
      <button
        key={m.id}
        type="button"
        className="rail-member"
        title={nombre}
        // El nombre accesible lleva el estado: el punto no se ve con lector
        aria-label={`${nombre}, ${ESTADO_LABEL[estado].toLowerCase()}`}
        onClick={(e) => {
          // La tarjeta se abre a la izquierda de la barra derecha
          const r = e.currentTarget.getBoundingClientRect()
          setCard({ member: m, x: r.left - 346, y: r.top - 40 })
        }}
      >
        <span className="rail-avatar-wrap">
          <Avatar url={m.avatar_url} name={m.full_name} size={30} />
          <span className={`presence-dot ${estado}`} role="img" aria-label={ESTADO_LABEL[estado]} />
        </span>
        <span className="rail-member-name">{nombre}</span>
      </button>
    )
  }

  return (
    <aside className="rail">
      <div className="rail-section">
        <div className="rail-head">
          <span className="rail-title">Equipo</span>
          <span className="rail-head-actions">
            <span className="muted small">{online} en línea</span>
            <button
              type="button"
              className="barra-toggle"
              aria-label={compacta ? 'Expandir la barra de equipo' : 'Contraer la barra de equipo'}
              aria-expanded={!compacta}
              onClick={alAlternar}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={compacta ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
              </svg>
            </button>
          </span>
        </div>
        {compacta && <NotifBell />}
        <div className="rail-members">
          {team === null && <SkeletonLista n={4} lineas={compacta ? 0 : 1} />}
          {conectados.map(fila)}
          {!compacta && desconectados.length > 0 && (
            <button
              type="button"
              className="rail-desconectados"
              aria-expanded={verDesconectados}
              onClick={alternarDesconectados}
            >
              <svg
                className={`nav-caret ${verDesconectados ? 'open' : ''}`}
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              {desconectados.length} {desconectados.length === 1 ? 'desconectado' : 'desconectados'}
            </button>
          )}
          {!compacta && verDesconectados && desconectados.map(fila)}
          {!compacta && team?.length === 0 && (
            <span className="muted small">
              {errorEquipo ? 'No se pudo cargar el equipo.' : 'Sin miembros.'}
            </span>
          )}
          {compacta && errorEquipo && team?.length === 0 && (
            <span
              className="rail-error"
              role="img"
              title="No se pudo cargar el equipo"
              aria-label="No se pudo cargar el equipo"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </span>
          )}
        </div>
        <Link to="/equipo" className="rail-link" title={compacta ? 'Ver equipo' : undefined}>
          {compacta && <IconoEquipo />}
          <span className="rail-link-texto">Ver equipo</span>
        </Link>
      </div>

      {!compacta && <NotifSections />}

      {card && (
        <ProfileCard
          member={card.member}
          anchor={{ x: card.x, y: card.y }}
          onClose={() => setCard(null)}
        />
      )}
    </aside>
  )
}
