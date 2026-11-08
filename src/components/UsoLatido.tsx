import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePresence } from '../context/PresenceContext'
import { supabase } from '../lib/supabase'
import {
  TICK_MS,
  acumular,
  claveDeRuta,
  cuerpoLatido,
  debeContar,
  hayAlgo,
  listoParaEnviar,
  type Pendiente,
} from '../lib/uso'

// Mide el uso del portal por miembro y app (migración 73, Administración →
// Uso). Sin render: vive dentro de PresenceProvider (que ya sabe cuándo
// hubo actividad, también dentro de las apps embebidas) y de Layout (que
// conoce la ruta).
//
// Cada minuto, si la pestaña está visible y hubo actividad en los últimos 5
// minutos, suma un minuto a la app abierta; cada cambio de ruta cuenta una
// apertura. Lo acumulado se manda a uso_latido() al llegar a 5 minutos, al
// ocultarse la pestaña, al cambiar de app y al cerrarla (fetch keepalive,
// porque supabase-js no lo expone y sendBeacon no lleva Authorization). La
// base pone el día (Bogotá) y acota los minutos por llamada. Un error se
// descarta: perder hasta 5 minutos no vale un aviso. Sin la migración
// (PGRST202/42883) el latido se apaga en esta sesión.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export default function UsoLatido() {
  const { session } = useAuth()
  const { ultimaActividad } = usePresence()
  const { pathname } = useLocation()
  const pendRef = useRef<Pendiente | null>(null)
  const claveRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const apagadoRef = useRef(false)
  const ultimoTickRef = useRef(0)
  tokenRef.current = session?.access_token ?? null

  // Envío normal (la página sigue viva)
  function enviar() {
    const pend = pendRef.current
    pendRef.current = null
    if (!hayAlgo(pend) || apagadoRef.current || !tokenRef.current) return
    void supabase
      .rpc('uso_latido', cuerpoLatido(pend as Pendiente))
      .then(({ error }) => {
        if (error && (error.code === 'PGRST202' || error.code === '42883')) apagadoRef.current = true
      })
  }

  // Envío al cerrar o recargar la pestaña: keepalive sobrevive al unload
  function enviarKeepalive() {
    const pend = pendRef.current
    pendRef.current = null
    if (!hayAlgo(pend) || apagadoRef.current || !tokenRef.current || !SUPABASE_URL || !SUPABASE_ANON) return
    try {
      void fetch(`${SUPABASE_URL}/rest/v1/rpc/uso_latido`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${tokenRef.current}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpoLatido(pend as Pendiente)),
      }).catch(() => undefined)
    } catch {
      /* sin red, sin uso que contar */
    }
  }

  // Cambio de ruta: se manda lo de la app anterior y se cuenta la apertura
  useEffect(() => {
    const clave = claveDeRuta(pathname)
    if (clave === claveRef.current) return
    enviar()
    claveRef.current = clave
    if (clave) pendRef.current = acumular(null, clave, { apertura: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (!session) return
    const tick = () => {
      const clave = claveRef.current
      const ahora = Date.now()
      // Ticks apretados (pestaña que vuelve del fondo) no cuentan doble
      if (!clave || ahora - ultimoTickRef.current < TICK_MS - 5_000) return
      ultimoTickRef.current = ahora
      if (!debeContar({ visible: document.visibilityState === 'visible', ultimaActividad: ultimaActividad(), ahora })) return
      pendRef.current = acumular(pendRef.current, clave, { minuto: true })
      if (listoParaEnviar(pendRef.current)) enviar()
    }
    const timer = window.setInterval(tick, TICK_MS)
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') enviar()
    }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', enviarKeepalive)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', enviarKeepalive)
      enviar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ultimaActividad])

  return null
}
