// Pruebas de autorización contra el portal en producción (SEG-U12/13).
// Abuso inocuo: cada caso pide algo que la cuenta no debe poder hacer y espera
// el rechazo (401/403, 42501) o una respuesta vacía; los ids son inventados.
// No escribe datos salvo, con --con-escritura, un evento «MANT ·» propio que
// borra al terminar. Las funciones dejan en la auditoría cada intento denegado.
// Lo corre el usuario, nunca Claude ni una sesión en la nube:
//   node tools/seguridad/pruebas-autorizacion.mjs --base        después de aplicar la 63 y la 64 (PostgREST y RPC)
//   node tools/seguridad/pruebas-autorizacion.mjs --funciones   después del deploy (Netlify Functions)
// Opciones:
//   --portal https://…   origen de las funciones (PORTAL_URL del .env o http://localhost:5190)
//   --solo B5            solo los casos cuyo id empieza así
//   --tras-cierre        (--base) después de credenciales_cerrar_texto_plano(): GET de password → 42501
//   --revelar <uuid>     (--base) solo el caso positivo de la bóveda, con una cuenta con view_credentials:
//                        el valor llega no vacío (nunca se imprime) y queda la fila de auditoría
//   --con-escritura      (--funciones) crea un «MANT · PRUEBA-CLAUDE» propio sin invitados,
//                        comprueba que notify-event no avisa a nadie y lo borra (también con
//                        Ctrl+C); si no se pudo borrar, avisa con el id para borrarlo a mano
// Sesión: tools/seguridad/sesion.mjs interactivo (correo y contraseña en la
// terminal). Los negativos se corren con claude-qa@ (solo member, AU-AM-06): si
// la cuenta es admin o tiene un permiso sensible, se omiten antes de llamar a
// nada que pudiera ejecutarse de verdad, y el script sale con 2.
// El freno de leads (6) y seguridad_resumen() (7) se prueban en
// supabase/pruebas/rls-simulacion.sql (con ROLLBACK): aquí insertarían leads
// reales o necesitarían la service role.
// Salida: una línea por caso (OK, FALLA u OMITIDO, con el motivo; nunca valores
// de la base) y el resumen. Sale con 1 si hay alguna FALLA.

import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cargarEntorno, iniciarSesion, rest } from './sesion.mjs'

export const PORTAL_POR_DEFECTO = 'http://localhost:5190'
const CUENTA_QA = 'claude-qa@empresa.test'
// Con cualquiera de estos permisos, o siendo admin, un «negativo» podría
// ejecutarse de verdad: esos casos solo corren con una cuenta sin ellos
export const SENSIBLES = ['manage_connectors', 'manage_leads', 'manage_credentials', 'view_credentials', 'view_mail', 'view_billing', 'edit_crm', 'manage_roles', 'manage_members', 'bot_asistente', 'ia_worker']
// Apps que abren lecturas del CRM o el Radar: si la cuenta las ve, ese caso no es un negativo
const APPS = ['directorio', 'cotizador', 'proyectos', 'licitaciones', 'gerencia']
// 404 de PostgREST por función o tabla inexistente: la migración no está aplicada
const NO_APLICADA = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ESPERA_CORRIDA_MS = 20_000
const WORKER = 'prueba-claude'
// Un calendario y un evento de Google que no existen (sin prueba de autoría)
const EVENTO_AJENO = { calendarId: 'prueba-claude@group.calendar.google.com', googleEventId: 'pruebaclaudeinexistente' }

export function leerArgumentos(argv) {
  const o = { base: false, funciones: false, portal: null, solo: null, trasCierre: false, revelar: null, conEscritura: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new Error(`${a} necesita un valor`)
      return v
    }
    if (a === '--base') o.base = true
    else if (a === '--funciones') o.funciones = true
    else if (a === '--portal') o.portal = valor().replace(/\/+$/, '')
    else if (a === '--solo') o.solo = valor()
    else if (a === '--tras-cierre') o.trasCierre = true
    else if (a === '--revelar') o.revelar = valor()
    else if (a === '--con-escritura') o.conEscritura = true
    else throw new Error(`Opción desconocida: ${a}`)
  }
  if (!o.base && !o.funciones) throw new Error('Falta el modo: --base (después de la 63 y la 64) o --funciones (después del deploy)')
  if (o.revelar !== null && !UUID.test(o.revelar)) throw new Error('--revelar necesita el uuid de un acceso de la bóveda')
  if ((o.revelar || o.trasCierre) && !o.base) throw new Error('--revelar y --tras-cierre van con --base')
  if (o.revelar && o.funciones) throw new Error('--revelar corre solo, sin --funciones')
  if (o.conEscritura && !o.funciones) throw new Error('--con-escritura va con --funciones')
  if (o.portal !== null && !/^https:\/\/[^\s/]+$/.test(o.portal)) throw new Error('--portal debe ser un origen https (sin ruta)')
  return o
}

// ---------- peticiones (nunca se imprime el cuerpo) ----------

async function llamar(url, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await r.text()
  let datos = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = texto
    }
  }
  return { status: r.status, datos }
}

// PostgREST con la sesión, o como anónimo (solo la clave publicable)
function pg(ctx, ruta, { method = 'GET', body, anon = false, prefer } = {}) {
  const headers = { apikey: ctx.sesion.anon }
  if (!anon) headers.Authorization = `Bearer ${ctx.sesion.token}`
  if (prefer) headers.Prefer = prefer
  return llamar(`${ctx.sesion.url}/rest/v1/${ruta}`, { method, headers, body })
}
const rpc = (ctx, funcion, body = {}, o = {}) => pg(ctx, `rpc/${funcion}`, { method: 'POST', body, ...o })

// Netlify Functions (/api/* → /.netlify/functions/*)
function fn(ctx, ruta, { method = 'POST', body, anon = false, token } = {}) {
  const headers = anon ? {} : { Authorization: `Bearer ${token ?? ctx.sesion.token}` }
  return llamar(`${ctx.portal}/api/${ruta}`, { method, headers, body })
}

// ---------- evaluación ----------

const ok = (detalle) => ({ estado: 'OK', detalle })
const falla = (detalle) => ({ estado: 'FALLA', detalle })
const omitido = (detalle) => ({ estado: 'OMITIDO', detalle })

// Estado y códigos de la respuesta, sin datos
export function resumen({ status, datos }) {
  const d = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  return [status, d.code, d.codigo, d.hint].filter((x) => x !== undefined && x !== null && x !== '').join(' · ')
}

function sinAplicar(res, mig) {
  return mig && res.status === 404 && NO_APLICADA.has(res.datos?.code) ? omitido(`la ${mig} no está aplicada (${resumen(res)})`) : null
}

// Un 429 de las funciones siempre trae codigo 'tasa'
function limite(res) {
  if (res.status !== 429) return null
  return res.datos?.codigo === 'tasa' ? omitido('429 · tasa: límite alcanzado, repetir en unos minutos') : falla(`429 sin codigo 'tasa' (${resumen(res)})`)
}

export function esperaRechazo(res, { status = [401, 403], code, hint, codigo, mig } = {}) {
  const previo = sinAplicar(res, mig) ?? limite(res)
  if (previo) return previo
  const d = res.datos && typeof res.datos === 'object' ? res.datos : {}
  const estados = [].concat(status)
  const bien = estados.includes(res.status) && (!code || d.code === code) && (!hint || d.hint === hint) && (!codigo || d.codigo === codigo)
  if (bien) return ok(resumen(res))
  return falla(`obtenido ${resumen(res)}; esperado ${[estados.join('/'), code, codigo, hint].filter(Boolean).join(' · ')}`)
}

export function esperaVacio(res, { mig, nulo = false } = {}) {
  const previo = sinAplicar(res, mig)
  if (previo) return previo
  if (res.status !== 200) return falla(`obtenido ${resumen(res)}; esperado 200`)
  if (nulo) return res.datos === null ? ok('200 · null') : falla('200 con datos; esperado null')
  if (Array.isArray(res.datos) && res.datos.length === 0) return ok('200 · []')
  return falla(`200 con ${Array.isArray(res.datos) ? `${res.datos.length} fila(s)` : 'datos'}; esperado []`)
}

// Anónimo: sin privilegio (401/403 · 42501) o vacío por la RLS
export function esperaDenegadoOVacio(res, mig) {
  const previo = sinAplicar(res, mig)
  if (previo) return previo
  if ([401, 403].includes(res.status) && res.datos?.code === '42501') return ok(resumen(res))
  if (res.status === 200 && Array.isArray(res.datos) && res.datos.length === 0) return ok('200 · [] (RLS)')
  const filas = res.status === 200 && Array.isArray(res.datos) ? ` con ${res.datos.length} fila(s)` : ''
  return falla(`obtenido ${resumen(res)}${filas}; esperado 401/403 · 42501 o []`)
}

// ---------- perfil de la cuenta ----------

function emailDe(token) {
  try {
    return String(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).email ?? '').toLowerCase()
  } catch {
    return ''
  }
}

async function perfilDeSesion(ctx) {
  const admin = await rpc(ctx, 'is_admin')
  const sensibles = []
  for (const perm of SENSIBLES) {
    const r = await rpc(ctx, 'has_perm', { perm })
    if (r.status !== 200 || r.datos !== false) sensibles.push(perm) // sin respuesta clara cuenta como sí: falla cerrado
  }
  const apps = {}
  for (const slug of APPS) {
    const r = await rpc(ctx, 'puede_ver_app', { p_slug: slug })
    apps[slug] = r.status === 200 && typeof r.datos === 'boolean' ? r.datos : null
  }
  return { admin: admin.status === 200 && typeof admin.datos === 'boolean' ? admin.datos : null, sensibles, apps }
}

// ---------- casos de --base (PostgREST y RPC) ----------

function casosBase(ctx) {
  const X = randomUUID() // un id que no existe
  const qa = (id, desc, correr) => ({ id, desc, grupo: 'qa', correr })
  const anon = (id, desc, correr) => ({ id, desc, grupo: 'anon', correr })

  // RPC de 63/64 y 67-71 que el anónimo no debe ejecutar; argumentos inocuos
  const rpcAnon = [
    ['bot_acceso', { p_uid: X }, '67'],
    ['bot_apps_equipo', {}, '67'],
    ['bot_cuentas_servicio', {}, '67'],
    ['ia_latido', { p_worker: WORKER, p_modelo: WORKER, p_features: [] }, '68'],
    ['claim_ia_trabajo', { p_worker: WORKER }, '68'],
    ['ia_contexto', { p_id: X, p_worker: WORKER }, '68'],
    ['completar_ia_trabajo', { p_id: X, p_worker: WORKER, p_resultado: {}, p_modelo: WORKER }, '68'],
    ['fallar_ia_trabajo', { p_id: X, p_worker: WORKER, p_error: WORKER }, '68'],
    ['ia_liberar', { p_worker: WORKER }, '68'],
    ['encolar_ia_trabajo', { p_feature: WORKER, p_solicitado_por: X }, '68'],
    ['tomar_respaldo_ia', { p_id: X, p_solicitado_por: X }, '68'],
    ['credencial_revelar', { p_id: X, p_campo: 'password' }, '69'],
    ['credencial_guardar_secreto', { p_id: X, p_campo: 'password', p_valor: '' }, '69'],
    ['credencial_a_vault', { p_id: X, p_campo: 'password', p_valor: '' }, '69'],
    ['credenciales_sincronizar_vault', {}, '69'],
    ['credenciales_cerrar_texto_plano', {}, '69'],
    ['svc_destinatarios', {}, '70'],
    ['cuentas_servicio_ids', {}, '71'],
    // p_user = p_actor: aunque se ejecutara, no crea ningún aviso
    ['push_notification', { p_user: X, p_actor: X, p_kind: WORKER, p_title: WORKER, p_body: '', p_project: null, p_subtask: null }, '63'],
    ['rate_limit_hit', { p_clave: WORKER, p_ventana_seg: 1, p_max: 1000 }, '64'],
    ['seguridad_resumen', {}, '64'],
  ]
  const tablasAnon = [
    ['tender_offers?select=id&limit=1', '66'],
    ['calendar_events?select=id&title=like.MANT*&limit=1', '13'],
    ['event_attendees?select=event_id&limit=1', '13'],
    ['bot_telegram_vinculos?select=chat_id&limit=1', '67'],
    ['ia_trabajos?select=id&limit=1', '68'],
    ['portal_credentials?select=id&limit=1', '13'],
    ['audit_log?select=id&limit=1', '18'],
    ['api_rate_limits?select=clave&limit=1', '64'],
  ]

  return [
    // (1) claude-qa: el bot, la cola de IA y lo ajeno
    qa('B1.1', 'rpc/bot_acceso con claude-qa → null', async () => esperaVacio(await rpc(ctx, 'bot_acceso', { p_uid: ctx.uid }), { mig: '67', nulo: true })),
    qa('B1.2', 'rpc/bot_apps_equipo con claude-qa → null', async () => esperaVacio(await rpc(ctx, 'bot_apps_equipo'), { mig: '67', nulo: true })),
    qa('B1.3', 'rpc/bot_cuentas_servicio con claude-qa → null', async () => esperaVacio(await rpc(ctx, 'bot_cuentas_servicio'), { mig: '67', nulo: true })),
    qa('B1.4', 'bot_telegram_vinculos ajenos → []', async () => esperaVacio(await pg(ctx, `bot_telegram_vinculos?select=chat_id&user_id=neq.${ctx.uid}&limit=5`), { mig: '67' })),
    qa('B1.5', 'ia_trabajos ajenos → []', async () => esperaVacio(await pg(ctx, `ia_trabajos?select=id&solicitado_por=neq.${ctx.uid}&limit=5`), { mig: '68' })),
    qa('B1.6', 'rpc/claim_ia_trabajo con claude-qa → 42501', async () => esperaRechazo(await rpc(ctx, 'claim_ia_trabajo', { p_worker: WORKER }), { status: 403, code: '42501', mig: '68' })),
    qa('B1.7', 'tender_offers sin ver Licitaciones ni Gerencia → []', async () => {
      if (ctx.perfil.apps.licitaciones !== false || ctx.perfil.apps.gerencia !== false) return omitido('la cuenta ve Licitaciones o Gerencia (o no se pudo saber): no es un negativo')
      return esperaVacio(await pg(ctx, 'tender_offers?select=id&limit=5'), { mig: '66' })
    }),

    // (2) anónimo: sin EXECUTE en las funciones nuevas y sin filas
    ...rpcAnon.map(([f, body, mig], i) =>
      anon(`B2.${i + 1}`, `anónimo: rpc/${f} → 401 · 42501`, async () => esperaRechazo(await rpc(ctx, f, body, { anon: true }), { code: '42501', mig })),
    ),
    ...tablasAnon.map(([ruta, mig], i) =>
      anon(`B2.${rpcAnon.length + i + 1}`, `anónimo: ${ruta.split('?')[0]} → 42501 o []`, async () => esperaDenegadoOVacio(await pg(ctx, ruta, { anon: true }), mig)),
    ),

    // (5) bóveda (69) con claude-qa
    qa('B5.1', 'rpc/credencial_revelar con claude-qa → 403 · 42501 · sin_permiso', async () => {
      const r = await rpc(ctx, 'credencial_revelar', { p_id: X, p_campo: 'password' })
      ctx.aplicada['69'] = !sinAplicar(r, '69')
      return esperaRechazo(r, { status: 403, code: '42501', hint: 'sin_permiso', mig: '69' })
    }),
    qa('B5.2', 'rpc/credencial_guardar_secreto con claude-qa → 403 · 42501 · sin_permiso', async () =>
      esperaRechazo(await rpc(ctx, 'credencial_guardar_secreto', { p_id: X, p_campo: 'password', p_valor: '' }), { status: 403, code: '42501', hint: 'sin_permiso', mig: '69' })),
    qa('B5.3', 'rpc/credenciales_cerrar_texto_plano con sesión → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'credenciales_cerrar_texto_plano'), { status: 403, code: '42501', mig: '69' })),
    qa('B5.4', 'rpc/credenciales_sincronizar_vault con sesión → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'credenciales_sincronizar_vault'), { status: 403, code: '42501', mig: '69' })),
    qa('B5.5', 'rpc/credencial_a_vault con sesión → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'credencial_a_vault', { p_id: X, p_campo: 'password', p_valor: '' }), { status: 403, code: '42501', mig: '69' })),
    qa('B5.6', 'PATCH de password en portal_credentials → 403 · 42501', async () => {
      if (ctx.aplicada['69'] === false) return omitido('la 69 no está aplicada')
      // id inventado: aunque la columna se pudiera escribir, no cambia ninguna fila
      return esperaRechazo(await pg(ctx, `portal_credentials?id=eq.${X}`, { method: 'PATCH', body: { password: '' }, prefer: 'return=minimal' }), { status: 403, code: '42501' })
    }),
    qa('B5.7', 'tras el cierre, GET portal_credentials?select=password → 403 · 42501', async () => {
      if (!ctx.o.trasCierre) return omitido('solo después de credenciales_cerrar_texto_plano() (--tras-cierre)')
      return esperaRechazo(await pg(ctx, 'portal_credentials?select=password&limit=1'), { status: 403, code: '42501' })
    }),

    // (7) funciones solo de la base o de la service role
    qa('B7.1', 'rpc/push_notification con claude-qa → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'push_notification', { p_user: ctx.uid, p_actor: ctx.uid, p_kind: WORKER, p_title: WORKER, p_body: '', p_project: null, p_subtask: null }), { status: 403, code: '42501', mig: '63' })),
    qa('B7.2', 'rpc/seguridad_resumen con claude-qa → 403 · 42501', async () => esperaRechazo(await rpc(ctx, 'seguridad_resumen'), { status: 403, code: '42501', mig: '64' })),
    qa('B7.3', 'rpc/rate_limit_hit con claude-qa → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'rate_limit_hit', { p_clave: WORKER, p_ventana_seg: 1, p_max: 1000 }), { status: 403, code: '42501', mig: '64' })),
    qa('B7.4', 'rpc/encolar_ia_trabajo con claude-qa → 403 · 42501', async () =>
      esperaRechazo(await rpc(ctx, 'encolar_ia_trabajo', { p_feature: WORKER, p_solicitado_por: ctx.uid }), { status: 403, code: '42501', mig: '68' })),
    qa('B7.5', 'rpc/svc_destinatarios con claude-qa → 403 · 42501', async () => esperaRechazo(await rpc(ctx, 'svc_destinatarios'), { status: 403, code: '42501', mig: '70' })),

    // (8) facturas (75) sin view_billing: authenticated tiene SELECT y la RLS deja la lectura
    // vacía (200 · [], no 403); sin grant de INSERT el alta da 403 · 42501. El cuerpo no trae
    // prefijo_numero (NOT NULL): aunque el permiso existiera, no se escribiría ninguna fila.
    qa('B8.1', 'facturas sin view_billing → 200 · [] (RLS)', async () => esperaVacio(await pg(ctx, 'facturas?select=pf_id&limit=5'), { mig: '75' })),
    qa('B8.2', 'POST facturas con claude-qa → 403 · 42501', async () =>
      esperaRechazo(await pg(ctx, 'facturas', { method: 'POST', body: { pf_id: -1 }, prefer: 'return=minimal' }), { status: 403, code: '42501', mig: '75' })),
  ]
}

// Positivo de la bóveda (--revelar): el valor no se imprime ni se guarda
function casoRevelar(ctx) {
  return {
    id: 'B5.8',
    desc: 'rpc/credencial_revelar con view_credentials → valor no vacío y fila credencial.revelar (base)',
    grupo: 'revelar',
    correr: async () => {
      const r = await rpc(ctx, 'credencial_revelar', { p_id: ctx.o.revelar, p_campo: 'password' })
      const previo = sinAplicar(r, '69')
      if (previo) return previo
      if (r.status !== 200) return falla(`obtenido ${resumen(r)}; esperado 200`)
      const lleno = typeof r.datos === 'string' && r.datos.length > 0
      r.datos = null
      if (!lleno) return falla('200 con el valor vacío: ¿el acceso tiene contraseña en Vault?')
      const a = await pg(ctx, `audit_log?select=action,origen&action=eq.credencial.revelar&entity_id=eq.${ctx.o.revelar}&order=id.desc&limit=1`)
      if (a.status === 200 && Array.isArray(a.datos) && a.datos.length) {
        return a.datos[0].origen === 'base' ? ok('valor no vacío (no se muestra) · auditoría credencial.revelar, origen base') : falla(`auditoría con origen ${a.datos[0].origen}`)
      }
      return omitido('valor no vacío (no se muestra); la cuenta no lee audit_log: confirmar la fila en Administración → Auditoría')
    },
  }
}

// ---------- casos de --funciones (Netlify) ----------

async function ultimaCorrida(ctx) {
  try {
    const filas = await rest(ctx.sesion, 'connector_runs?select=started_at&order=started_at.desc&limit=1')
    return filas?.[0]?.started_at ?? null
  } catch {
    return undefined
  }
}

// Borra el evento de prueba. Un DELETE que la RLS filtra responde 204 sin
// filas, así que se pide la fila borrada y se exige una. Devuelve '' o la nota
// con el id para borrarlo a mano.
async function borrarEventoDePrueba(ctx, id) {
  try {
    const filas = await rest(ctx.sesion, `calendar_events?id=eq.${id}&select=id`, { method: 'DELETE', prefer: 'return=representation' })
    if (Array.isArray(filas) && filas.length === 1) return ''
  } catch {
    // se avisa igual
  }
  ctx.log(`AVISO: el evento de prueba «MANT · PRUEBA-CLAUDE» (id ${id}) NO se borró y el equipo lo ve en el Calendario: bórralo a mano.`)
  return ` · el evento de prueba ${id} NO se borró: bórralo a mano en el Calendario`
}

async function mantSinInvitados(ctx) {
  if (!ctx.o.conEscritura) return omitido('con --con-escritura (crea y borra un evento propio); lo cubre netlify/functions/__tests__/correos.test.ts')
  const inicio = new Date(Date.now() + 2 * 86_400_000)
  inicio.setUTCMinutes(0, 0, 0)
  const creado = await rest(ctx.sesion, 'calendar_events?select=id', {
    method: 'POST',
    body: { title: 'MANT · PRUEBA-CLAUDE · autorización', starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 1_800_000).toISOString(), all_day: false },
    prefer: 'return=representation',
  })
  const id = creado?.[0]?.id
  if (!id) return falla('no se pudo crear el evento de prueba')
  // Un solo borrado, también si se interrumpe con Ctrl+C mientras se espera a notify-event
  let borrado = null
  const borrar = () => (borrado ??= borrarEventoDePrueba(ctx, id))
  const alInterrumpir = () => {
    ctx.log(`\nInterrumpido: se borra el evento de prueba ${id} antes de salir.`)
    borrar().then((pendiente) => {
      if (!pendiente) ctx.log('Evento de prueba borrado.')
      process.exit(130)
    })
  }
  process.once('SIGINT', alInterrumpir)
  let r
  let error
  try {
    r = await fn(ctx, 'notify-event', { body: { eventId: id } })
  } catch (e) {
    error = e
  }
  const nota = await borrar()
  process.off('SIGINT', alInterrumpir)
  if (error) return falla(`error: ${error.message}${nota}`)
  const tasa = limite(r)
  if (tasa) return { ...tasa, detalle: tasa.detalle + nota }
  const d = r.datos && typeof r.datos === 'object' ? r.datos : {}
  const bien = r.status === 200 && d.sinAviso === 'mantenimiento_sin_invitados' && d.recipients === 0 && d.push?.sent === 0 && d.email?.sent === 0
  if (bien) return ok(`200 · sinAviso mantenimiento_sin_invitados · 0 destinatarios${nota}`)
  return falla(`obtenido ${resumen(r)} · sinAviso ${d.sinAviso ?? '—'} · destinatarios ${d.recipients ?? '—'}; esperado 200 sin avisos${nota}`)
}

function casosFunciones(ctx) {
  const X = randomUUID()
  const qa = (id, desc, correr) => ({ id, desc, grupo: 'qa', correr })
  const anon = (id, desc, correr) => ({ id, desc, grupo: 'anon', correr })
  const proxy = (action, connector, extra = {}) => fn(ctx, 'connector-proxy', { body: { connector, action, ...extra } })
  const sinPermiso = (res) => esperaRechazo(res, { status: 403, codigo: 'sin_permiso' })

  const funcionesAnon = [
    ['connector-proxy', { connector: 'hubspot', action: 'list-contacts' }],
    ['scan-alertas-correo', undefined],
    ['mail-inbox', { action: 'status' }],
    ['mail-ai', {}],
    ['calendar-import', {}],
    ['notify-event', { eventId: X }],
    ['push-notify', undefined],
    ['meet-create', { accion: 'estado' }],
  ]

  return [
    // (2) sin sesión
    ...funcionesAnon.map(([ruta, body], i) =>
      anon(`F2.${i + 1}`, `anónimo: POST /api/${ruta} → 401 · no_autenticado`, async () =>
        esperaRechazo(await fn(ctx, ruta, { body, anon: true }), { status: 401, codigo: 'no_autenticado' })),
    ),
    anon(`F2.${funcionesAnon.length + 1}`, 'token inventado: POST /api/connector-proxy → 401 · sesion_invalida', async () =>
      esperaRechazo(await fn(ctx, 'connector-proxy', { body: { connector: 'hubspot', action: 'list-contacts' }, token: 'token-inventado' }), { status: 401, codigo: 'sesion_invalida' })),

    // (1) claude-qa sin permisos: 403 sin_permiso, nunca 404 ni 502
    qa('F1.1', 'list-contacts con claude-qa → 403 · sin_permiso', async () => {
      const ve = ['directorio', 'cotizador', 'proyectos', 'licitaciones'].filter((a) => ctx.perfil.apps[a] !== false)
      if (ve.length) return omitido(`la cuenta ve ${ve.join(', ')} (o no se pudo saber): leer el CRM le corresponde`)
      return sinPermiso(await proxy('list-contacts', 'hubspot'))
    }),
    qa('F1.2', 'ensure-crm-properties con claude-qa → 403 · sin_permiso', async () => sinPermiso(await proxy('ensure-crm-properties', 'hubspot'))),
    qa('F1.3', 'drive-status con claude-qa → 403 · sin_permiso', async () => sinPermiso(await proxy('drive-status', 'drive'))),
    qa('F1.4', 'lead-reply con claude-qa → 403 · sin_permiso', async () => sinPermiso(await proxy('lead-reply', 'ia', { leadId: X }))),
    qa('F1.5', 'update-event sin prueba de autoría → 403 · sin_permiso', async () => sinPermiso(await proxy('update-event', 'calendar', EVENTO_AJENO))),
    qa('F1.6', 'delete-event sin prueba de autoría → 403 · sin_permiso', async () => sinPermiso(await proxy('delete-event', 'calendar', EVENTO_AJENO))),
    qa('F1.7', 'delete-project de un proyecto ajeno con claude-qa → 403 · sin_permiso', async () => sinPermiso(await proxy('delete-project', 'drive', { projectId: X }))),

    // (3) correo y calendario
    qa('F3.1', 'scan-alertas-correo sin ?buzon → 403', async () => esperaRechazo(await fn(ctx, 'scan-alertas-correo'), { status: 403 })),
    qa('F3.2', 'scan-alertas-correo con el buzón propio → 200 sin cuentas ni parExplicito', async () => {
      if (!ctx.email) return omitido('no se pudo leer el correo de la sesión')
      const r = await fn(ctx, `scan-alertas-correo?buzon=${encodeURIComponent(ctx.email)}`)
      const tasa = limite(r)
      if (tasa) return tasa
      const d = r.datos && typeof r.datos === 'object' ? r.datos : {}
      if (r.status !== 200) return falla(`obtenido ${resumen(r)}; esperado 200`)
      if ('cuentas' in d || 'parExplicito' in d) return falla('la respuesta trae cuentas o parExplicito (solo para admins)')
      if (ctx.email === CUENTA_QA && d.configurado !== false) return falla('claude-qa sin buzón: se esperaba configurado false')
      return ok(`200 · configurado ${d.configurado}`)
    }),
    qa('F3.3', 'scan-alertas-correo con ?buzon=otro@ → 403', async () =>
      esperaRechazo(await fn(ctx, `scan-alertas-correo?buzon=${encodeURIComponent('otro@empresa.test')}`), { status: 403 })),
    qa('F3.4', "mail-inbox {action:'list', mailbox:'team'} → 403", async () => esperaRechazo(await fn(ctx, 'mail-inbox', { body: { action: 'list', mailbox: 'team' } }), { status: 403 })),
    anon('F3.5', 'calendar-ics con un UUID inexistente → 401', async () => esperaRechazo(await fn(ctx, `calendar-ics?t=${X}`, { method: 'GET', anon: true }), { status: 401 })),
    anon('F3.6', 'calendar-ics con un token que no es UUID → 401', async () => esperaRechazo(await fn(ctx, 'calendar-ics?t=no-es-uuid', { method: 'GET', anon: true }), { status: 401 })),
    qa('F3.7', 'notify-event de un evento inexistente → 404', async () => esperaRechazo(await fn(ctx, 'notify-event', { body: { eventId: X } }), { status: 404 })),
    qa('F3.8', 'notify-event de un «MANT ·» sin invitados → 200 sin avisar a nadie', async () => mantSinInvitados(ctx)),
    qa('F3.9', 'notify-event sin poder leer los invitados → 503 · invitados_no_disponibles', async () =>
      omitido('no se puede provocar desde fuera; lo cubre netlify/functions/__tests__/correos.test.ts')),
    qa('F3.10', 'scan-alertas-correo con ?buzon=no-es-correo → 400 · parametros', async () =>
      esperaRechazo(await fn(ctx, 'scan-alertas-correo?buzon=no-es-correo'), { status: 400, codigo: 'parametros' })),

    // (4) sincronización y avisos del Radar
    anon('F4.1', 'sync-connectors-background sin sesión → 202', async () => {
      ctx.corridaAntes = await ultimaCorrida(ctx)
      const r = await fn(ctx, 'sync-connectors-background', { anon: true })
      return r.status === 202 ? ok('202') : falla(`obtenido ${resumen(r)}; esperado 202`)
    }),
    qa('F4.2', 'sync-connectors-background con claude-qa sin ver Licitaciones → 202', async () => {
      if (ctx.perfil.apps.licitaciones !== false) return omitido('la cuenta ve Licitaciones (o no se pudo saber): correría una sincronización real')
      const r = await fn(ctx, 'sync-connectors-background')
      return r.status === 202 ? ok('202') : falla(`obtenido ${resumen(r)}; esperado 202`)
    }),
    anon('F4.3', 'sin fila nueva en connector_runs tras los 202', async () => {
      if (ctx.corridaAntes === undefined) return omitido('no se pudo leer connector_runs antes')
      await ctx.esperar(ESPERA_CORRIDA_MS)
      const despues = await ultimaCorrida(ctx)
      if (despues === undefined) return omitido('no se pudo leer connector_runs después')
      // La fila se inserta al terminar cada conector (netlify/lib/connectors.mts):
      // que no aparezca no prueba el rechazo; que aparezca, sí lo desmiente
      if (despues === ctx.corridaAntes) {
        return omitido(`no concluyente: ninguna corrida nueva en ${ESPERA_CORRIDA_MS / 1000} s, pero la fila llega al terminar el primer conector; mirar connector_runs dentro de unos minutos`)
      }
      return falla('apareció una corrida nueva tras los 202: el rechazo no se aplicó (salvo que sea la programada de las 10:30 UTC: revisar portal_id y hora en connector_runs)')
    }),
    qa('F4.4', 'push-notify con claude-qa → 403 si Licitaciones tiene roles; sin novedades → 200 · sent 0', async () => {
      const ve = ctx.perfil.apps.licitaciones
      if (ve === false) return esperaRechazo(await fn(ctx, 'push-notify'), { status: 403, codigo: 'sin_permiso' })
      if (ve !== true) return omitido('no se pudo saber si la cuenta ve Licitaciones')
      // La app no tiene roles y la ve todo el equipo: solo se llama sin novedades, para no avisar a nadie
      const desde = new Date(Date.now() - 5 * 60_000).toISOString()
      const rec = await pg(ctx, `tender_notifications?select=id&created_at=gte.${encodeURIComponent(desde)}&limit=1`)
      if (rec.status !== 200 || !Array.isArray(rec.datos)) return omitido('no se pudo comprobar que no haya novedades')
      if (rec.datos.length) return omitido('hay novedades de los últimos minutos: llamar enviaría avisos reales')
      const r = await fn(ctx, 'push-notify')
      const tasa = limite(r)
      if (tasa) return tasa
      return r.status === 200 && r.datos?.sent === 0 ? ok('200 · sent 0, sin gastar cupo') : falla(`obtenido ${resumen(r)}; esperado 200 · sent 0`)
    }),
    qa('F4.5', "push-notify: 429 'push-notify:global' (600 s, 6) solo con novedades", async () =>
      omitido('se provocaría enviando avisos reales; lo cubre netlify/functions/__tests__/vigia.test.ts')),
  ]
}

// ---------- ejecución ----------

// sesion: la de iniciarSesion(); las pruebas pasan una simulada. Devuelve el
// código de salida.
export async function ejecutar(o, { sesion, portal = PORTAL_POR_DEFECTO, log = console.log, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const ctx = { sesion, portal, o, uid: sesion.userId, email: emailDe(sesion.token), esperar, log, aplicada: {}, perfil: { admin: null, sensibles: [], apps: {} } }
  let casos
  let apta = false
  if (o.revelar) {
    casos = [casoRevelar(ctx)]
  } else {
    ctx.perfil = await perfilDeSesion(ctx)
    apta = ctx.perfil.admin === false && ctx.perfil.sensibles.length === 0
    const cuenta = ctx.email === CUENTA_QA ? 'claude-qa@' : 'una cuenta distinta de claude-qa@'
    if (apta) log(`Sesión con ${cuenta}: sin admin ni permisos sensibles.`)
    else if (ctx.perfil.admin !== false) log(`Sesión con ${cuenta}: es admin o no se pudo leer is_admin. Los negativos se omiten: córrelos con claude-qa@.`)
    else log(`Sesión con ${cuenta}: tiene ${ctx.perfil.sensibles.join(', ')}. Los negativos se omiten: córrelos con claude-qa@.`)
    casos = [...(o.base ? casosBase(ctx) : []), ...(o.funciones ? casosFunciones(ctx) : [])]
  }
  if (o.solo) casos = casos.filter((c) => c.id.startsWith(o.solo))

  const cuenta = { OK: 0, FALLA: 0, OMITIDO: 0 }
  let omitidosPorCuenta = 0
  for (const c of casos) {
    let r
    if (c.grupo === 'qa' && !apta) {
      r = omitido('la cuenta no sirve para los negativos (ver arriba)')
      omitidosPorCuenta++
    } else {
      try {
        r = await c.correr(ctx)
      } catch (e) {
        r = falla(`error: ${e.message}`)
      }
    }
    cuenta[r.estado]++
    log(`${r.estado.padEnd(8)}${c.id.padEnd(7)}${c.desc} — ${r.detalle}`)
  }
  log(`\n${cuenta.OK} OK · ${cuenta.FALLA} FALLA · ${cuenta.OMITIDO} OMITIDO de ${casos.length} casos.`)
  if (cuenta.FALLA) return 1
  return omitidosPorCuenta ? 2 : 0
}

function portalDe(env) {
  const u = String(env.PORTAL_URL ?? '').trim().replace(/\/+$/, '')
  return /^https:\/\/[^\s/]+$/.test(u) ? u : PORTAL_POR_DEFECTO
}

async function main() {
  let o
  try {
    o = leerArgumentos(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    return 2
  }
  try {
    cargarEntorno()
    const portal = o.portal ?? portalDe(process.env)
    const sesion = await iniciarSesion({ interactivo: true })
    return await ejecutar(o, { sesion, portal })
  } catch (e) {
    console.error(`ERROR: ${e.message}`)
    return 1
  }
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (esPrincipal) main().then((codigo) => process.exit(codigo))
