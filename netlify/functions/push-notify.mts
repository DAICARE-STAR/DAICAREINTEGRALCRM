import { auditar, autenticar, exigir, limiteBase, respuesta, tokenDeCabecera } from '../lib/autorizacion.mts'
import { broadcastEmail, emailConfigured } from '../lib/email.mts'
import { broadcastPush, idsQueVenApp, pushConfigured } from '../lib/push.mts'

// Aviso inmediato (push + correo): la app de licitaciones llama
// POST /api/push-notify después de crear notificaciones (nueva alerta o
// «Revisar ahora»). Seguridad: exige sesión válida y ver la app
// Licitaciones (quien no ve el Radar no dispara avisos), un límite global
// compartido entre instancias y deja el envío en la auditoría. El TEXTO
// del aviso se compone AQUÍ desde la base: el cliente no controla el
// contenido. Destinatarios (AU-DEC-04): quien ve Licitaciones, más los
// admins; nunca las cuentas de servicio.

// Como máximo 6 envíos al equipo cada 10 minutos, sumando a todos los
// miembros (rpc rate_limit_hit, migración 64)
const VENTANA_GLOBAL_SEG = 600
const MAX_GLOBAL = 6

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 })
  }

  const r = await autenticar(tokenDeCabecera(req.headers.get('authorization')), {
    maxPorMinuto: 6,
    accion: 'push-notify',
  })
  if (r.fallo) return respuesta(r.fallo)
  const ctx = r.ctx

  const falta = await exigir(ctx, { apps: ['licitaciones'] }, 'push-notify')
  if (falta) return respuesta(falta)

  if (!pushConfigured() && !emailConfigured()) {
    return Response.json({ sent: 0, note: 'ni push (VAPID) ni correo (SMTP) configurados' })
  }

  // Composición server-side: notificaciones creadas en los últimos 3 minutos
  const desde = new Date(Date.now() - 3 * 60_000).toISOString()
  const { data: recientes, error } = await ctx.admin
    .from('tender_notifications')
    .select('title, country, deadline, budget_usd')
    .gte('created_at', desde)
  if (error) {
    console.error('push-notify: no se pudieron leer las notificaciones:', error.message)
    return Response.json({ error: 'No se pudieron leer las notificaciones' }, { status: 500 })
  }

  const n = recientes?.length ?? 0
  if (n === 0) return Response.json({ sent: 0, note: 'sin novedades recientes' })

  // Sin destinatarios legibles no se avisa a nadie (ni se gasta el cupo)
  const destinatarios = await idsQueVenApp(ctx.admin, 'licitaciones')
  if (!destinatarios) {
    return Response.json({ error: 'No se pudieron leer los destinatarios' }, { status: 500 })
  }

  // El límite global cuenta solo los envíos reales: va después de exigir
  // (una cuenta sin permiso no gasta el cupo del equipo) y de ver que hay
  // novedades (la app llama aquí tras crear cada alerta, aunque no traiga
  // coincidencias)
  const tasa = await limiteBase(ctx, 'push-notify:global', VENTANA_GLOBAL_SEG, MAX_GLOBAL)
  if (tasa) return respuesta(tasa)

  const body =
    n === 1
      ? `Nueva coincidencia: ${(recientes?.[0]?.title ?? '').slice(0, 90)}`
      : `${n} nuevas coincidencias con las alertas del equipo.`

  const push = await broadcastPush(
    ctx.admin,
    {
      title: 'Radar de Licitaciones',
      body,
      url: '/licitaciones',
      tag: 'licitaciones-inmediato',
    },
    { userIds: destinatarios },
  )

  let email = { sent: 0 }
  try {
    email = await broadcastEmail(ctx.admin, recientes ?? [], destinatarios)
  } catch {
    // correo best-effort: no debe tumbar la respuesta
  }

  await auditar(ctx.admin, {
    userId: ctx.userId,
    email: ctx.email,
    action: 'licitacion.avisar_equipo',
    detail: `${n} coincidencia(s) · push a ${push.sent} · correo a ${email.sent}`,
    entity: 'tender_notifications',
  })

  return Response.json({ recent: n, ...push, email })
}
