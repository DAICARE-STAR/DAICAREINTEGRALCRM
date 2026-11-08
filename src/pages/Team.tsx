import { useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar'
import CabeceraPagina from '../components/CabeceraPagina'
import { IconoEquipo } from '../components/IconosNav'
import ProfileCard, { type ProfileCardMember } from '../components/ProfileCard'
import { SkeletonLista } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useInstalacion } from '../context/InstalacionContext'
import { usePresence } from '../context/PresenceContext'
import { fetchTeamMembers } from '../lib/calendar'
import { fetchMemberStatuses, relativeSeen } from '../lib/team'
import { useTitulo } from '../lib/useTitulo'
import type { MemberStatus, TeamMember } from '../types'

type Estado = 'online' | 'away' | 'offline'

const ESTADO_LABEL: Record<Estado, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
}

export default function Team() {
  useTitulo('Equipo')
  const { profile } = useAuth()
  // La última conexión vive en member_status, del módulo chat
  const conChat = useInstalacion().tieneModulo('chat')
  const { presence, manualAway, setManualAway } = usePresence()
  // null = cargando (skeleton); [] = error (con su aviso)
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [statuses, setStatuses] = useState<MemberStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  // Tarjeta de perfil flotante del miembro pulsado
  const [card, setCard] = useState<{ member: ProfileCardMember; x: number; y: number } | null>(null)
  // Re-render por minuto: mantiene fresco el «hace X min»
  const [, setTick] = useState(0)

  const myId = profile?.id

  function load() {
    fetchTeamMembers()
      .then(setTeam)
      .catch(() => {
        setTeam([])
        setError('No se pudo cargar el equipo. ¿Está aplicada la migración 13?')
      })
    if (!conChat) return
    fetchMemberStatuses()
      .then((s) => {
        setStatuses(s)
        setError(null)
      })
      .catch(() => setError('No se pudieron cargar los datos. ¿Está aplicada la migración 15?'))
  }

  useEffect(() => {
    load()
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function estadoDe(userId: string): Estado {
    const p = presence[userId]
    if (!p) return 'offline'
    return p.state === 'online' ? 'online' : 'away'
  }

  const lastSeen = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of statuses) map.set(s.user_id, s.last_seen_at)
    return map
  }, [statuses])

  const ordered = useMemo(() => {
    const rank: Record<Estado, number> = { online: 0, away: 1, offline: 2 }
    return [...(team ?? [])].sort((a, b) => {
      const diff = rank[estadoDe(a.id)] - rank[estadoDe(b.id)]
      if (diff !== 0) return diff
      return (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, presence])

  const online = (team ?? []).filter((m) => estadoDe(m.id) === 'online').length

  return (
    <div className="page">
      <CabeceraPagina titulo="Equipo" icono={<IconoEquipo size={24} />}>
        <label className="team-away-toggle">
          <input
            type="checkbox"
            checked={manualAway}
            onChange={(e) => setManualAway(e.target.checked)}
          />
          Marcarme como ausente
        </label>
      </CabeceraPagina>

      {error && <p className="alert">{error}</p>}

      <div className="team-estado-titulo">
        <h2>Estado</h2>
        {/* Nunca «0 de 0»: mientras carga, el skeleton de la lista; con
            error, nada */}
        {team !== null && team.length > 0 && (
          <p className="muted">
            {online} de {team.length} en línea ahora mismo.
          </p>
        )}
      </div>
      {team === null && <SkeletonLista n={6} lineas={2} />}
      <div className="team-list">
        {ordered.map((m) => {
          const estado = estadoDe(m.id)
          const seen = lastSeen.get(m.id)
          return (
            <article
              key={m.id}
              className="team-card team-card-click"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setCard({ member: m, x: r.left, y: r.bottom + 6 })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  setCard({ member: m, x: r.left, y: r.bottom + 6 })
                }
              }}
            >
              <span className="rail-avatar-wrap">
                <Avatar url={m.avatar_url} name={m.full_name} size={38} />
                <span className={`presence-dot ${estado}`} />
              </span>
              <div className="team-card-main">
                <strong>
                  {m.full_name ?? 'Sin nombre'}
                  {m.id === myId ? ' (tú)' : ''}
                </strong>
                <span className={`role role-${m.role}`}>{m.role}</span>
              </div>
              <div className="team-card-status">
                <span className={`team-estado ${estado}`}>{ESTADO_LABEL[estado]}</span>
                {estado === 'offline' && seen && (
                  <span className="muted">últ. vez {relativeSeen(seen)}</span>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {card && (
        <ProfileCard
          member={card.member}
          anchor={{ x: card.x, y: card.y }}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  )
}
