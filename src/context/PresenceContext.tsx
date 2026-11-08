import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useInstalacion } from './InstalacionContext'

// Presencia del equipo vía Supabase Realtime Presence: efímera (no toca la
// base). Cada pestaña con sesión se une al canal `team-presence` con su
// user_id como clave y publica su estado; el resto lo recibe al instante.
//
// Estados: 'online' (activo), 'away' (sin actividad 5 min, o marcado a mano).
// Quien no aparece en el canal está desconectado.
//
// Además, un latido cada 4 min guarda member_status.last_seen_at para poder
// mostrar «última vez» de los desconectados (si la migración 15 no está
// aplicada, el upsert falla en silencio y solo se pierde ese dato).

export type PresenceState = 'online' | 'away'

export interface TeamPresence {
  [userId: string]: { state: PresenceState; at: string }
}

interface PresenceCtx {
  presence: TeamPresence
  manualAway: boolean
  setManualAway: (v: boolean) => void
  // Actividad que no llega por los eventos del shell (dentro del iframe de
  // una app): el visor la reporta aquí. ultimaActividad la lee el latido de
  // uso (UsoLatido) para decidir si un minuto cuenta.
  marcarActividad: () => void
  ultimaActividad: () => number
}

const PresenceContext = createContext<PresenceCtx | undefined>(undefined)

const IDLE_MS = 5 * 60_000
const CHECK_MS = 30_000
const HEARTBEAT_MS = 4 * 60_000
// Meta sin refrescar en este tiempo = fantasma (pestaña muerta, doble
// montaje de StrictMode…). Cada pestaña refresca la suya cada CHECK_MS,
// así que 3× deja margen para relojes algo desfasados y ticks perezosos
// de pestañas en segundo plano.
const META_FRESCA_MS = 3 * CHECK_MS

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { tieneModulo } = useInstalacion()
  const [presence, setPresence] = useState<TeamPresence>({})
  const [manualAway, setManualAway] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastActivityRef = useRef(Date.now())
  const stateRef = useRef<PresenceState>('online')
  const manualAwayRef = useRef(false)
  manualAwayRef.current = manualAway
  // onActivity vive dentro del efecto de la sesión; se expone por ref para
  // que el visor de apps y el latido de uso no dependan de ese ciclo
  const onActivityRef = useRef<() => void>(() => {
    lastActivityRef.current = Date.now()
  })
  const marcarActividad = useCallback(() => onActivityRef.current(), [])
  const ultimaActividad = useCallback(() => lastActivityRef.current, [])

  useEffect(() => {
    if (!session) {
      setPresence({})
      return
    }
    const userId = session.user.id

    const channel = supabase.channel('team-presence', {
      config: { presence: { key: userId } },
    })
    channelRef.current = channel

    function readPresence() {
      const raw = channel.presenceState<{
        state: PresenceState
        at: string
        manual?: boolean
      }>()
      const map: TeamPresence = {}
      const ahora = Date.now()
      for (const [key, metas] of Object.entries(raw)) {
        if (metas.length === 0) continue
        // Varias metas del mismo usuario = varias pestañas. Como cada
        // pestaña viva refresca su meta cada CHECK_MS, las que llevan rato
        // sin refrescarse son fantasmas (pestaña muerta, StrictMode) y se
        // descartan; si TODAS están viejas se usan igual (un reloj
        // desfasado no debe hacer desaparecer a nadie). Entre las que
        // quedan: la ausencia MARCADA A MANO manda sobre todo; si no la
        // hay, basta una pestaña «online» para estar en línea — trabajar
        // en una pestaña con otra olvidada en ausente no es estar ausente.
        const frescas = metas.filter(
          (m) => m.at && ahora - Date.parse(m.at) < META_FRESCA_MS
        )
        const pool = frescas.length ? frescas : metas
        const meta =
          pool.find((m) => m.state === 'away' && m.manual) ??
          pool.find((m) => m.state === 'online') ??
          pool.reduce((a, b) => ((a.at ?? '') >= (b.at ?? '') ? a : b))
        map[key] = { state: meta.state, at: meta.at }
      }
      setPresence(map)
    }

    function track(state: PresenceState) {
      stateRef.current = state
      void channel.track({
        state,
        at: new Date().toISOString(),
        manual: state === 'away' && manualAwayRef.current,
      })
    }

    channel
      .on('presence', { event: 'sync' }, readPresence)
      .subscribe((status) => {
        // Si este montaje ya fue limpiado (StrictMode), no publicar nada:
        // evitaría una meta huérfana sin dueño en el canal.
        if (status === 'SUBSCRIBED' && channelRef.current === channel) {
          track(manualAwayRef.current ? 'away' : 'online')
        }
      })

    // Actividad del usuario → online (salvo ausencia manual)
    function onActivity() {
      lastActivityRef.current = Date.now()
      if (!manualAwayRef.current && stateRef.current !== 'online') track('online')
    }
    onActivityRef.current = onActivity
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('pointermove', onActivity)
    window.addEventListener('keydown', onActivity)

    // Revisión periódica de inactividad. Se publica SIEMPRE (no solo al
    // cambiar): el refresco del `at` es lo que distingue una pestaña viva
    // de una meta fantasma en readPresence.
    const idleTimer = window.setInterval(() => {
      const away =
        manualAwayRef.current || Date.now() - lastActivityRef.current > IDLE_MS
      track(away ? 'away' : 'online')
    }, CHECK_MS)

    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('pointermove', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.clearInterval(idleTimer)
      onActivityRef.current = () => {
        lastActivityRef.current = Date.now()
      }
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [session])

  // Latido de «última vez» en member_status, tabla del módulo chat
  // (11-chat.sql): sin el módulo no se escribe.
  const conChat = tieneModulo('chat')
  useEffect(() => {
    if (!session || !conChat) return
    const userId = session.user.id
    async function heartbeat() {
      await supabase
        .from('member_status')
        .upsert({ user_id: userId, last_seen_at: new Date().toISOString() })
        .then(() => undefined)
    }
    void heartbeat()
    const heartbeatTimer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS)
    return () => window.clearInterval(heartbeatTimer)
  }, [session, conChat])

  // Cambio de ausencia manual → publicar de inmediato
  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return
    const next: PresenceState = manualAway ? 'away' : 'online'
    if (next !== stateRef.current) {
      stateRef.current = next
      void channel.track({
        state: next,
        at: new Date().toISOString(),
        manual: next === 'away', // este efecto solo corre al marcarla a mano
      })
    }
    if (!manualAway) lastActivityRef.current = Date.now()
  }, [manualAway])

  return (
    <PresenceContext.Provider
      value={{ presence, manualAway, setManualAway, marcarActividad, ultimaActividad }}
    >
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const ctx = useContext(PresenceContext)
  if (!ctx) throw new Error('usePresence debe usarse dentro de PresenceProvider')
  return ctx
}
