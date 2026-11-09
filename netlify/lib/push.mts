import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { puedeVerApp } from './autorizacion.mts'
import { leerModulos, slugsActivos } from './modulos-instalacion.mts'
import { esCuentaServicio } from './email.mts'

// Envío de Web Push a las suscripciones de una lista de miembros. Lo
// comparten el Radar (check-tender-alerts y push-notify), los leads
// (check-new-leads) y el Calendario (check-event-reminders y notify-event).
// Vive en netlify/lib/ (NO en netlify/functions/) para que Netlify no lo
// trate como una función más.

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

// Ids que nunca reciben avisos: las cuentas de servicio (claude-dev,
// bot, claude-qa) por la lista única de email.mts (profiles no guarda
// el correo) y los miembros suspendidos (banned_until futuro). Con plazo,
// porque la función programada corta a los 30 s. Si Auth falla o no
// responde devuelve null y el aviso sale sin la exclusión: un push de más
// al navegador de una cuenta sin buzón pesa menos que dejar al equipo sin
// aviso (mismo criterio que check-event-reminders).
const USUARIOS_POR_PAGINA = 1000
const MAX_PAGINAS = 20
const PLAZO_CUENTAS_SERVICIO_MS = 5000
// check-new-leads y check-event-reminders llaman a broadcastPush una vez
// por lead o por evento: la lectura (o su fallo) se memoriza por cliente
// durante 60 s para que un Auth colgado no sume 5 s en cada aviso.
const MEMO_SIN_AVISO_MS = 60_000
const memoSinAviso = new WeakMap<SupabaseClient, { hasta: number; ids: Promise<Set<string> | null> }>()

async function leerSinAviso(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>()
  const ahora = Date.now()
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USUARIOS_POR_PAGINA })
    if (error) throw error
    const users = data?.users ?? []
    for (const u of users) {
      const suspendido = Boolean(u.banned_until) && new Date(u.banned_until as string).getTime() > ahora
      if (suspendido || esCuentaServicio(u.email)) ids.add(u.id)
    }
    if (users.length < USUARIOS_POR_PAGINA) break
  }
  return ids
}

function idsSinAviso(admin: SupabaseClient): Promise<Set<string> | null> {
  const ahora = Date.now()
  const memo = memoSinAviso.get(admin)
  if (memo && memo.hasta > ahora) return memo.ids
  const ids = sinAvisoConPlazo(admin)
  memoSinAviso.set(admin, { hasta: ahora + MEMO_SIN_AVISO_MS, ids })
  return ids
}

async function sinAvisoConPlazo(admin: SupabaseClient): Promise<Set<string> | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const plazo = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('plazo de Auth vencido')), PLAZO_CUENTAS_SERVICIO_MS)
  })
  try {
    return await Promise.race([leerSinAviso(admin), plazo])
  } catch (err) {
    console.error('push: cuentas de servicio y suspendidos no disponibles, el aviso sale sin excluirlos', {
      motivo: err instanceof Error ? err.message.slice(0, 200) : 'error desconocido',
    })
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

// Devuelve cuántos avisos se entregaron. Solo avisa a opts.userIds, sin
// las cuentas de servicio ni los suspendidos; una lista vacía no avisa a
// nadie (no hay modo «a todo el equipo»: quien llama decide los
// destinatarios). Las suscripciones muertas (404/410: navegador
// desinstalado, permiso revocado) se eliminan.
export async function broadcastPush(
  admin: SupabaseClient,
  payload: PushPayload,
  opts: { userIds: readonly string[] },
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured() || opts.userIds.length === 0) return { sent: 0, removed: 0 }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:marketing@empresa.test',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', [...opts.userIds])
  if (error || !data || data.length === 0) return { sent: 0, removed: 0 }

  const excluidos = await idsSinAviso(admin)
  const subs = excluidos ? data.filter((s) => !excluidos.has(s.user_id as string)) : data
  if (subs.length === 0) return { sent: 0, removed: 0 }

  const body = JSON.stringify(payload)
  let sent = 0
  const dead: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
        // otros errores (red, límite) se ignoran: se reintenta en el próximo envío
      }
    }),
  )

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }
  return { sent, removed: dead.length }
}

type FilaMiembro = {
  id: string
  user_roles?: { role: string; roles: { permissions?: string[] | null } | null }[] | null
}

// Destinatarios de los avisos de una app (AU-DEC-04 (1)): los miembros que
// la ven, con la misma regla que puedeVerApp (roles y permisos app_* de
// cada rol; módulo inactivo = nadie, ni los admins), más los admins. Sin las
// cuentas de servicio ni los suspendidos (lectura de Auth memorizada, la
// misma que reutiliza broadcastPush; si falla, sin esa exclusión). null si
// no se pudieron leer los módulos o los miembros: quien llama no avisa a nadie.
export async function idsQueVenApp(admin: SupabaseClient, slug: string): Promise<string[] | null> {
  const [modulos, miembros, excluidos] = await Promise.all([
    leerModulos(admin),
    admin.from('profiles').select('id, user_roles ( role, roles ( permissions ) )'),
    idsSinAviso(admin),
  ])
  if (!modulos || miembros.error || !miembros.data) {
    console.error('push: destinatarios no disponibles, sin aviso', {
      app: slug,
      codigo: miembros.error?.code ?? null,
    })
    return null
  }
  const activos = slugsActivos(modulos)
  if (!activos.includes(slug)) return []
  return (miembros.data as FilaMiembro[])
    .filter((m) => {
      if (excluidos?.has(m.id)) return false
      const filas = m.user_roles ?? []
      const roles = filas.map((f) => f.role)
      const permisos = [...new Set(filas.flatMap((f) => f.roles?.permissions ?? []))]
      return puedeVerApp(activos, slug, roles, permisos)
    })
    .map((m) => m.id)
}
