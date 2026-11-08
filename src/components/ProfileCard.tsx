import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { usePresence } from '../context/PresenceContext'
import { supabase } from '../lib/supabase'
import { relativeSeen } from '../lib/team'
import { useDialogo } from '../lib/useDialogo'
import Avatar from './Avatar'
import { Cargando, Skeleton, SkeletonLista } from './Skeleton'

// Tarjeta de perfil flotante (estilo Discord): se abre al pulsar un miembro
// en la barra derecha o en /equipo. Muestra presencia, roles y los
// proyectos activos que tiene asignados. Se cierra con Escape, clic fuera o
// al navegar. En móvil se ancla abajo como hoja deslizante (ver CSS).
// useDialogo (no modal: Tab puede salir) pone el foco dentro al abrir, cierra
// con Escape y devuelve el foco al miembro pulsado.

const ESTADO_LABEL: Record<string, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
}

export interface ProfileCardMember {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string
}

interface RoleChip {
  role: string
  color: string | null
  position: number
}

interface MiniProject {
  id: string
  code: string
  status: string
}

const CARD_W = 330

export default function ProfileCard({
  member,
  anchor,
  onClose,
}: {
  member: ProfileCardMember
  anchor: { x: number; y: number }
  onClose: () => void
}) {
  const { presence } = usePresence()
  const [roles, setRoles] = useState<RoleChip[] | null>(null)
  const [projects, setProjects] = useState<MiniProject[] | null>(null)
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const p = presence[member.id]
  const estado = p ? (p.state === 'online' ? 'online' : 'away') : 'offline'

  useEffect(() => {
    let alive = true

    // Roles con su color (migración 26). Si RLS no deja leer los roles de
    // otros usuarios, se cae al rol principal cacheado en el perfil.
    supabase
      .from('user_roles')
      .select('role, roles ( color, position )')
      .eq('user_id', member.id)
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data || data.length === 0) {
          setRoles([{ role: member.role, color: null, position: 0 }])
          return
        }
        const chips = data.map((r) => {
          // supabase-js tipa la relación como array; en runtime es un objeto
          const raw = r.roles as unknown
          const rel = (Array.isArray(raw) ? raw[0] : raw) as
            | { color: string | null; position: number }
            | null
          return { role: r.role as string, color: rel?.color ?? null, position: rel?.position ?? 0 }
        })
        chips.sort((a, b) => b.position - a.position)
        setRoles(chips)
      })

    // Proyectos activos asignados (la tabla es legible para todo el equipo)
    supabase
      .from('projects')
      .select('id, code, status')
      .eq('assigned_to', member.id)
      .eq('archived', false)
      .order('code')
      .limit(30)
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data) {
          setProjects([])
          return
        }
        setProjects(
          (data as MiniProject[]).filter(
            (x) => x.status !== 'Listo' && x.status !== 'No se realizará'
          )
        )
      })

    supabase
      .from('member_status')
      .select('last_seen_at')
      .eq('user_id', member.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setLastSeen((data as { last_seen_at: string }).last_seen_at)
      })

    return () => {
      alive = false
    }
  }, [member.id, member.role])

  // Escape, foco inicial y retorno del foco: useDialogo
  useDialogo(cardRef, { alCerrar: onClose })

  // Cierre por clic fuera
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  // Posición flotante junto al elemento pulsado, sin salirse de la ventana.
  // En ≤760px el CSS ignora estas coordenadas y la ancla abajo (hoja).
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - CARD_W - 16))
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - 440))

  // Portal al body: la tarjeta usa position:fixed con coordenadas de
  // viewport, y cualquier ancestro con transform, filter o backdrop-filter
  // se vuelve su bloque contenedor y la desplaza fuera de pantalla
  // (recortada por el overflow de la barra).
  return createPortal(
    <div
      ref={cardRef}
      className="profile-pop"
      style={{ left, top }}
      role="dialog"
      aria-modal="false"
      aria-label={`Perfil de ${member.full_name ?? 'miembro'}`}
      tabIndex={-1}
    >
      <div className="profile-pop-banner" />
      <div className="profile-pop-head">
        <span className="rail-avatar-wrap profile-pop-avatar">
          <Avatar url={member.avatar_url} name={member.full_name} size={64} />
          <span className={`presence-dot ${estado}`} role="img" aria-label={ESTADO_LABEL[estado]} />
        </span>
        <button type="button" className="profile-pop-close" onClick={onClose} aria-label="Cerrar">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="profile-pop-body">
        <strong className="profile-pop-name">{member.full_name ?? 'Sin nombre'}</strong>
        <span className="muted small">
          {ESTADO_LABEL[estado]}
          {estado === 'offline' && lastSeen ? ` · últ. vez ${relativeSeen(lastSeen)}` : ''}
        </span>

        <div className="profile-pop-sec">
          <span className="profile-pop-title">Roles</span>
          <div className="role-chips">
            {roles === null && (
              <Cargando etiqueta="Cargando roles" anunciar={false}>
                <Skeleton style={{ width: '8rem' }} />
              </Cargando>
            )}
            {roles?.map((r) => (
              <span
                key={r.role}
                className="role-chip"
                style={r.color ? { color: r.color, borderColor: r.color } : undefined}
              >
                {r.role}
              </span>
            ))}
          </div>
        </div>

        <div className="profile-pop-sec">
          <span className="profile-pop-title">Proyectos asignados</span>
          {projects === null && <SkeletonLista n={2} avatar={false} lineas={1} />}
          {projects !== null && projects.length === 0 && (
            <span className="muted small">Sin proyectos activos asignados.</span>
          )}
          {projects !== null && projects.length > 0 && (
            <div className="profile-pop-projects">
              {projects.slice(0, 6).map((pr) => (
                <Link
                  key={pr.id}
                  to={`/apps/proyectos?proyecto=${pr.id}`}
                  className="profile-pop-project"
                  onClick={onClose}
                  title={pr.status}
                >
                  <span className="profile-pop-project-code">{pr.code}</span>
                  <span className="muted small">{pr.status}</span>
                </Link>
              ))}
              {projects.length > 6 && (
                <span className="muted small">y {projects.length - 6} más…</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
