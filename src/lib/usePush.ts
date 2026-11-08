import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Avisos push del navegador (Web Push), compartidos por todo el portal:
// leads, recordatorios de reunión y radar de licitaciones salen por aquí.
//
// El permiso es POR DISPOSITIVO Y POR NAVEGADOR: activarlo en el computador
// no lo activa en el móvil. En iPhone además solo funciona si el portal se
// instaló en la pantalla de inicio y se abre desde ese icono (lo habilita
// el manifiesto en modo standalone).

// Clave pública VAPID de la instalación (pública por diseño; la privada vive
// solo en Netlify). Sin ella el push queda como no disponible.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''

export type PushState = 'unsupported' | 'off' | 'on' | 'denied' | 'working'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function usePush() {
  const [estado, setEstado] = useState<PushState>('unsupported')

  // Estado real al montar
  useEffect(() => {
    let cancelado = false
    if (!pushSupported() || !VAPID_PUBLIC_KEY) return
    if (Notification.permission === 'denied') {
      setEstado('denied')
      return
    }
    navigator.serviceWorker
      .getRegistration('/push-sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then(async (sub) => {
        if (cancelado) return
        if (!sub) {
          setEstado('off')
          return
        }
        // El navegador dice que hay suscripción, pero la fila de
        // push_subscriptions pudo borrarse sola: el servidor la elimina
        // cuando el servicio de push responde 404/410 (endpoint rotado).
        // Sin esto diría «activos» sin que llegara nada. El upsert es
        // idempotente por endpoint, así que cada visita repara la fila.
        const json = sub.toJSON()
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await supabase.from('push_subscriptions').upsert(
            { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
            { onConflict: 'endpoint' },
          )
        }
        if (!cancelado) setEstado('on')
      })
      .catch(() => {
        if (!cancelado) setEstado('off')
      })
    return () => {
      cancelado = true
    }
  }, [])

  async function activar() {
    setEstado('working')
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.register('/push-sw.js')
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }))
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('suscripción incompleta')
      }
      const { error } = await supabase.from('push_subscriptions').upsert(
        { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: 'endpoint' },
      )
      if (error) throw new Error(error.message)
      setEstado('on')
    } catch {
      setEstado('off')
    }
  }

  async function desactivar() {
    setEstado('working')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setEstado('off')
    } catch {
      setEstado('on')
    }
  }

  return { estado, activar, desactivar }
}
