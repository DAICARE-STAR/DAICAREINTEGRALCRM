import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useInstalacion } from './InstalacionContext'
import { NOMBRE_PORTAL } from '../lib/instalacion'
import { supabase } from '../lib/supabase'

// Estado compartido de notificaciones del shell: personales
// (user_notifications, migración 24) y avisos del radar
// (tender_notifications). Una sola suscripción realtime alimenta a la
// barra derecha (escritorio) y a la campana del topbar (móvil).

export interface MiNotif {
  id: string
  kind: string
  title: string
  body: string
  link: string
  read: boolean
  created_at: string
}

export interface RadarNotif {
  id: string
  tender_id: string
  title: string
  country: string
  read: boolean
  created_at: string
}

interface NotificationsValue {
  mine: MiNotif[]
  radar: RadarNotif[]
  unread: number
  // El radar solo existe con el módulo licitaciones activo
  conRadar: boolean
  marcarMisLeidas: () => Promise<void>
  marcarRadarLeidas: () => Promise<void>
  abrirMiNotif: (n: MiNotif) => Promise<void>
  abrirRadarNotif: (n: RadarNotif) => Promise<void>
  // Historial: últimas notificaciones incluyendo las ya leídas
  historialMio: () => Promise<MiNotif[]>
  historialRadar: () => Promise<RadarNotif[]>
}

const Ctx = createContext<NotificationsValue>({
  mine: [],
  radar: [],
  unread: 0,
  conRadar: false,
  marcarMisLeidas: async () => {},
  marcarRadarLeidas: async () => {},
  abrirMiNotif: async () => {},
  abrirRadarNotif: async () => {},
  historialMio: async () => [],
  historialRadar: async () => [],
})

const BASE_TITLE = NOMBRE_PORTAL

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  // tender_notifications es del módulo licitaciones (27-licitaciones.sql)
  const conRadar = useInstalacion().tieneModulo('licitaciones')
  const uid = profile?.id ?? null
  const [mine, setMine] = useState<MiNotif[]>([])
  const [radar, setRadar] = useState<RadarNotif[]>([])
  const mineTimer = useRef<number | undefined>(undefined)
  const radarTimer = useRef<number | undefined>(undefined)

  const loadMine = useCallback(() => {
    if (!uid) {
      setMine([])
      return
    }
    void supabase
      .from('user_notifications')
      .select('id, kind, title, body, link, read, created_at')
      .eq('user_id', uid)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setMine((data as MiNotif[]) ?? []))
  }, [uid])

  const loadRadar = useCallback(() => {
    if (!conRadar) {
      setRadar([])
      return
    }
    void supabase
      .from('tender_notifications')
      .select('id, tender_id, title, country, read, created_at')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setRadar((data as RadarNotif[]) ?? []))
  }, [conRadar])

  useEffect(() => {
    loadMine()
    loadRadar()

    // Recargas antirrebote: un batch de inserts dispara una sola consulta
    const debouncedMine = () => {
      window.clearTimeout(mineTimer.current)
      mineTimer.current = window.setTimeout(loadMine, 400)
    }
    const debouncedRadar = () => {
      window.clearTimeout(radarTimer.current)
      radarTimer.current = window.setTimeout(loadRadar, 400)
    }
    let canal = supabase
      .channel('notifs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          ...(uid ? { filter: `user_id=eq.${uid}` } : {}),
        },
        debouncedMine
      )
    if (conRadar) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tender_notifications' },
        debouncedRadar
      )
    }
    const channel = canal
      // Red de seguridad: si el websocket se cae y vuelve (portátil que
      // duerme, wifi que salta), sin esto los avisos llegados mientras
      // tanto no aparecerían hasta recargar la página a mano.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          loadMine()
          loadRadar()
        }
      })

    // Al volver a la pestaña también se refresca: cubre el caso en que el
    // canal se cerró sin avisar.
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        debouncedMine()
        debouncedRadar()
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.clearTimeout(mineTimer.current)
      window.clearTimeout(radarTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [uid, loadMine, loadRadar, conRadar])

  const unread = mine.length + radar.length

  // El título de la pestaña refleja lo pendiente: «(3) Portal del equipo …»
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = BASE_TITLE
    }
  }, [unread])

  const marcarMisLeidas = useCallback(async () => {
    const ids = mine.map((n) => n.id)
    if (ids.length === 0) return
    setMine([])
    await supabase.from('user_notifications').update({ read: true }).in('id', ids)
  }, [mine])

  const marcarRadarLeidas = useCallback(async () => {
    const ids = radar.map((n) => n.id)
    if (ids.length === 0) return
    setRadar([])
    await supabase.from('tender_notifications').update({ read: true }).in('id', ids)
  }, [radar])

  const abrirMiNotif = useCallback(async (n: MiNotif) => {
    setMine((prev) => prev.filter((x) => x.id !== n.id))
    await supabase.from('user_notifications').update({ read: true }).eq('id', n.id)
  }, [])

  const abrirRadarNotif = useCallback(async (n: RadarNotif) => {
    setRadar((prev) => prev.filter((x) => x.id !== n.id))
    await supabase.from('tender_notifications').update({ read: true }).eq('id', n.id)
  }, [])

  const historialMio = useCallback(async (): Promise<MiNotif[]> => {
    if (!uid) return []
    const { data } = await supabase
      .from('user_notifications')
      .select('id, kind, title, body, link, read, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(15)
    return (data as MiNotif[]) ?? []
  }, [uid])

  const historialRadar = useCallback(async (): Promise<RadarNotif[]> => {
    if (!conRadar) return []
    const { data } = await supabase
      .from('tender_notifications')
      .select('id, tender_id, title, country, read, created_at')
      .order('created_at', { ascending: false })
      .limit(15)
    return (data as RadarNotif[]) ?? []
  }, [conRadar])

  return (
    <Ctx.Provider
      value={{
        mine,
        radar,
        unread,
        conRadar,
        marcarMisLeidas,
        marcarRadarLeidas,
        abrirMiNotif,
        abrirRadarNotif,
        historialMio,
        historialRadar,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(Ctx)
}
