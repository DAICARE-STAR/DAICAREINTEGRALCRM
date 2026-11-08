import type { SupabaseClient } from '@supabase/supabase-js'

// Correo del portal cuando el radar detecta licitaciones.
// Envía por el SMTP de la instalación (SMTP_HOST) con credenciales en variables de
// entorno de Netlify. Destinatarios: los miembros que indica quien llama
// (auth.users vía service role), excluyendo cuentas de servicio.
// Si SMTP no está configurado, todo es no-op silencioso.

// Cuentas de servicio (desarrollo, bot y pruebas): no tienen buzón real, así
// que se excluyen de toda lista de destinatarios y de miembros visibles.
// Lista única: la usan también connector-proxy (SERVICE_EMAILS), mail-inbox
// y scan-alertas-correo.
export const CUENTAS_SERVICIO: readonly string[] = [
  'claude-dev@empresa.test',
  'bot@empresa.test',
  'claude-qa@empresa.test',
]

export function esCuentaServicio(email: string | null | undefined): boolean {
  return !!email && CUENTAS_SERVICIO.includes(email.trim().toLowerCase())
}

// Enlace que puede ir como botón en un correo: solo https y sin espacios,
// comillas ni < >, la misma forma que el CHECK de meeting_url (migración
// 63). Otro esquema (javascript:, data:) devuelve null y no hay botón.
export function enlaceHttps(url: string | null | undefined): string | null {
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null
}

// Ruta del portal que abre una reunión concreta (día seleccionado y tarjeta
// resaltada). La usan las invitaciones, los recordatorios, el push y la
// campana; la lee src/pages/Calendar.tsx.
export function enlaceReunion(id: string): string {
  return `/calendario?reunion=${encodeURIComponent(id)}`
}

// Bloque de mantenimiento: reunión sembrada con el título «MANT · …». La ve
// todo el equipo en el calendario, pero sus avisos y el feed iCal son solo
// para sus invitados; sin invitados no avisa a nadie. Solo el prefijo exacto
// del sembrador (a lo sumo con espacios delante): una reunión real como
// «Mant · luminarias hotel» sigue avisando al equipo.
export function esBloqueMantenimiento(titulo: string | null | undefined): boolean {
  return /^\s*MANT · /.test(titulo ?? '')
}

export type Asistente = { user_id: string; invited?: boolean }

export type DestinoAviso =
  | { modo: 'invitados'; userIds: string[] }
  | { modo: 'equipo' }
  | { modo: 'nadie' }

// A quién avisa una reunión (recordatorios e invitaciones: una sola regla).
// Invitados del creador (invited=true) → solo a ellos; los RSVP espontáneos
// (invited=false) no cuentan. Sin invitados, la reunión abierta avisa a todo
// el equipo, salvo un bloque de mantenimiento, que no avisa a nadie.
export function destinoAviso(ev: { title: string }, asistentes: Asistente[]): DestinoAviso {
  const userIds = asistentes.filter((a) => a.invited !== false).map((a) => a.user_id)
  if (userIds.length > 0) return { modo: 'invitados', userIds }
  return esBloqueMantenimiento(ev.title) ? { modo: 'nadie' } : { modo: 'equipo' }
}

// Los títulos/descripciones que van al HTML del correo vienen de la base
// (eventos escritos por usuarios) o de portales externos (licitaciones):
// escapar entidades evita inyectar enlaces o markup con la identidad del
// portal. El texto plano y el ICS no lo necesitan (el ICS escapa aparte).
// Nombre visible de la instalación en los correos (el mismo VITE_PORTAL_NOMBRE
// del shell; Netlify lo pasa también a las funciones)
export function nombrePortal(): string {
  return process.env.VITE_PORTAL_NOMBRE?.trim() || 'Portal del equipo'
}

export function escHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export type TenderItem = {
  title: string
  country: string
  deadline: string
  budget_usd: number | null
}

const money = new Intl.NumberFormat('es-419', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function fechaLarga(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('es-419', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// Correos del equipo. Con userIds solo devuelve esos usuarios (ej.
// invitados a una reunión); sin él, todos los miembros del portal.
export async function teamEmails(
  admin: SupabaseClient,
  userIds?: string[],
): Promise<string[]> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error || !data) return []
  return data.users
    .filter((u) => !userIds || userIds.includes(u.id))
    .map((u) => u.email ?? '')
    .filter((e) => e && !esCuentaServicio(e))
}

export type EmailContent = { subject: string; html: string; text: string }

// Opciones para casos que no son un aviso masivo normal
export type SendOptions = {
  // Adjunto iCalendar: convierte el correo en una INVITACIÓN de calendario.
  // Gmail/Google Calendar, Outlook y Apple lo detectan y ofrecen añadir el
  // evento y responder Sí/No/Quizá.
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string; filename?: string }
  // Destinatarios visibles en el To (una invitación de equipo no se manda
  // en copia oculta: cada quien debe verse a sí mismo como invitado, o el
  // cliente de correo no asocia el RSVP).
  visibleTo?: boolean
}

// Envío genérico (lo comparten el radar de licitaciones, los recordatorios
// del calendario y las invitaciones). fromName: nombre visible del remitente.
export async function sendEmailTo(
  recipients: string[],
  content: EmailContent,
  fromName = nombrePortal(),
  opts: SendOptions = {},
): Promise<{ sent: number }> {
  if (!emailConfigured() || recipients.length === 0) return { sent: 0 }

  // nodemailer se carga al enviar: las funciones que importan este módulo
  // solo por sus utilidades (cuentas de servicio, escHtml) no lo cargan
  const { createTransport } = await import('nodemailer')
  const port = Number(process.env.SMTP_PORT ?? 465)
  // 465: TLS implícito. En cualquier otro puerto (587, 25) STARTTLS es
  // obligatorio: si el servidor no lo ofrece, nodemailer aborta sin enviar.
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  await transporter.sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    ...(opts.visibleTo
      ? { to: recipients }
      : { to: process.env.SMTP_USER, bcc: recipients }),
    subject: content.subject,
    text: content.text,
    html: content.html,
    ...(opts.icalEvent
      ? {
          icalEvent: {
            method: opts.icalEvent.method,
            filename: opts.icalEvent.filename ?? 'invitacion.ics',
            content: opts.icalEvent.content,
          },
        }
      : {}),
  })
  return { sent: recipients.length }
}

// Cuerpo del correo (claro con el acento: los clientes de correo no
// respetan temas oscuros de forma fiable)
export function renderTenderEmail(items: TenderItem[], portalUrl: string) {
  const mostradas = items.slice(0, 10)
  const resto = items.length - mostradas.length
  const n = items.length
  const subject =
    n === 1
      ? `Radar de Licitaciones: 1 nueva coincidencia — ${mostradas[0].title.slice(0, 60)}`
      : `Radar de Licitaciones: ${n} nuevas coincidencias`

  const filas = mostradas
    .map(
      (t) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #E4E1DB;">
          <div style="font-weight:600;color:#171512;font-size:14px;line-height:1.4;">${escHtml(t.title)}</div>
          <div style="color:#625C52;font-size:12.5px;margin-top:4px;">
            ${escHtml(t.country)} · ${t.budget_usd !== null ? money.format(t.budget_usd) : 'Monto no publicado'} · cierra el ${fechaLarga(t.deadline)}
          </div>
        </td>
      </tr>`,
    )
    .join('')

  const html = `
  <div style="background:#F2F0EC;padding:28px 12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E4E1DB;border-radius:12px;overflow:hidden;">
      <div style="background:#171512;padding:18px 20px;">
        <span style="color:#7CC3DC;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${escHtml(nombrePortal())}</span>
        <h1 style="color:#ffffff;font-size:18px;margin:6px 0 0;">Radar de Licitaciones</h1>
      </div>
      <div style="padding:18px 20px 6px;">
        <p style="color:#171512;font-size:14px;margin:0 0 12px;">
          ${n === 1 ? 'Se detectó <strong>1 licitación nueva</strong>' : `Se detectaron <strong>${n} licitaciones nuevas</strong>`}
          que coinciden con las alertas del equipo:
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;">${filas}</table>
      ${resto > 0 ? `<p style="color:#625C52;font-size:12.5px;padding:10px 20px 0;margin:0;">…y ${resto} más en el portal.</p>` : ''}
      <div style="padding:20px;text-align:center;">
        <a href="${portalUrl}/licitaciones"
           style="display:inline-block;background:#7CC3DC;color:#171512;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px;text-decoration:none;">
          Abrir el radar
        </a>
      </div>
      <p style="color:#AAA49A;font-size:11px;text-align:center;padding:0 20px 18px;margin:0;">
        Recibes este correo por ser miembro del portal del equipo.
      </p>
    </div>
  </div>`

  const text =
    (n === 1 ? 'Se detectó 1 licitación nueva' : `Se detectaron ${n} licitaciones nuevas`) +
    ' que coinciden con las alertas del equipo:\n\n' +
    mostradas
      .map(
        (t) =>
          `• ${t.title}\n  ${t.country} · ${t.budget_usd !== null ? money.format(t.budget_usd) : 'Monto no publicado'} · cierra el ${fechaLarga(t.deadline)}`,
      )
      .join('\n\n') +
    (resto > 0 ? `\n\n…y ${resto} más.` : '') +
    `\n\nAbrir el radar: ${portalUrl}/licitaciones`

  return { subject, html, text }
}

// Un solo envío con BCC a esos miembros (AU-DEC-04: quien ve Licitaciones,
// más los admins). Una lista vacía no avisa a nadie.
export async function broadcastEmail(
  admin: SupabaseClient,
  items: TenderItem[],
  userIds: readonly string[],
): Promise<{ sent: number }> {
  if (!emailConfigured() || items.length === 0 || userIds.length === 0) return { sent: 0 }

  const destinatarios = await teamEmails(admin, [...userIds])
  const portalUrl = process.env.URL ?? 'http://localhost:5190'
  return sendEmailTo(destinatarios, renderTenderEmail(items, portalUrl), `Radar de Licitaciones — ${nombrePortal()}`)
}
