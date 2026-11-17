import { logAction } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'
import { leerAjustes } from './catalogos'
import { aParametrosRpc, type FiltrosCrm } from './filtros'
import type { CuentaActual, DatosCuenta } from './importador'
import type { Actividad, AjustesCrm, CampoDef, Contacto, Cuenta, TipoActividad } from './tipos'

// Acceso a Supabase del CRM. Cada escritura pide .select() y falla si no
// tocó filas (el RLS no da error: devuelve cero filas). La auditoría
// (logAction 'crm.<verbo>') nunca lleva datos de salud (PP-DEC-19).

export class SinFilas extends Error {
  constructor() {
    super('sin_filas')
    this.name = 'SinFilas'
  }
}

function afectadas<T>(rows: T[] | null): T[] {
  if (!rows || rows.length === 0) throw new SinFilas()
  return rows
}

type ErrorPg = { code?: unknown; hint?: unknown }

const CATALOGO: Record<string, string> = {
  crm_etapa: 'La etapa no está en el catálogo.',
  crm_origen: 'El origen no está en el catálogo.',
  crm_tipo_empresa: 'El tipo de empresa no es válido para esta cuenta.',
  crm_relacion: 'La relación no está en el catálogo.',
  crm_etiqueta: 'Una etiqueta supera 40 caracteres.',
  crm_responsable: 'El responsable no puede ser una cuenta de servicio.',
  crm_contacto_cuenta: 'El contacto no pertenece a la cuenta.',
  crm_salud_persona: 'Los datos de salud son solo de una persona.',
  crm_consentimiento_revocado: 'El consentimiento ya está revocado.',
  crm_consentimiento_inmutable: 'Un consentimiento solo se puede revocar.',
}

const PERMISO: Record<string, string> = {
  salud_permiso: 'No tienes permiso para los datos de salud.',
  salud_mfa: 'Los datos de salud exigen el segundo factor activo en esta sesión.',
  salud_sin_consentimiento: 'Falta el consentimiento de datos de salud vigente.',
  salud_sin_clave: 'La clave de cifrado de salud no está configurada.',
  crm_modulo: 'El CRM no está disponible.',
  crm_exportar: 'No tienes permiso para exportar.',
}

/**
 * Mensaje en español para un error de Supabase, por código y hint (nunca por
 * el texto). `etiquetas` traduce la clave de un campo personalizado;
 * `entidad` distingue el duplicado (documento de cuenta o contacto principal).
 */
export function traducirError(err: unknown, opciones: { etiquetas?: Record<string, string>; entidad?: 'cuenta' | 'contacto' } = {}): string {
  if (err instanceof SinFilas) return 'No se guardó nada: no tienes permiso o el registro ya no existe.'
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorPg
  const code = typeof e.code === 'string' ? e.code : ''
  const hint = typeof e.hint === 'string' ? e.hint : ''
  if (hint === 'salud_sin_clave') return PERMISO.salud_sin_clave
  switch (code) {
    case '23514':
      if (hint.startsWith('crm_campo:')) {
        const clave = hint.slice('crm_campo:'.length)
        return `El campo «${opciones.etiquetas?.[clave] ?? clave}» falta o no es válido.`
      }
      return CATALOGO[hint] ?? 'Algún dato no cumple el formato esperado.'
    case '42501':
      return PERMISO[hint] ?? 'No tienes permiso para esta acción.'
    case '23505':
      if (opciones.entidad === 'cuenta') return 'Ya existe una cuenta activa con ese documento.'
      if (opciones.entidad === 'contacto') return 'La cuenta ya tiene un contacto principal.'
      return 'El registro ya existe.'
    case '23503':
      return 'El registro relacionado ya no existe.'
    case 'P0002':
      return 'La cuenta no existe.'
    case '22023':
      return hint === 'salud_datos' ? 'Los datos de salud no tienen el formato esperado.' : 'Algún dato no es válido.'
    case 'PGRST116':
      return 'El registro no existe o no tienes acceso.'
    default:
      return 'No se pudo completar la operación.'
  }
}

// ---------- Catálogos y campos ----------

export async function leerAjustesCrm(): Promise<AjustesCrm> {
  const { data, error } = await supabase.rpc('crm_ajustes')
  if (error) throw error
  return leerAjustes(data)
}

export async function guardarAjustesCrm(ajustes: AjustesCrm): Promise<void> {
  const { data: fila, error: errLeer } = await supabase.from('instalacion').select('ajustes').eq('id', 1).maybeSingle()
  if (errLeer) throw errLeer
  const actual = (fila?.ajustes ?? {}) as Record<string, unknown>
  const { data, error } = await supabase
    .from('instalacion')
    .update({ ajustes: { ...actual, crm: ajustes } })
    .eq('id', 1)
    .select('id')
  if (error) throw error
  afectadas(data)
  void logAction('crm.ajustes', 'Cambió los catálogos del CRM', 'instalacion', '1')
}

export async function leerCampos(): Promise<CampoDef[]> {
  const { data, error } = await supabase.from('crm_campos_def').select('*').order('orden').order('clave')
  if (error) throw error
  return (data ?? []) as CampoDef[]
}

export async function guardarCampo(def: CampoDef, nuevo: boolean): Promise<void> {
  const consulta = nuevo
    ? supabase.from('crm_campos_def').insert(def)
    : supabase.from('crm_campos_def').update({ ...def, clave: undefined }).eq('clave', def.clave)
  const { data, error } = await consulta.select('clave')
  if (error) throw error
  afectadas(data)
  void logAction(nuevo ? 'crm.campo_crear' : 'crm.campo_editar', `Campo ${def.clave} (${def.entidad})`, 'crm_campos_def', def.clave)
}

export async function borrarCampo(clave: string): Promise<void> {
  const { data, error } = await supabase.from('crm_campos_def').delete().eq('clave', clave).select('clave')
  if (error) throw error
  afectadas(data)
  void logAction('crm.campo_borrar', `Campo ${clave}`, 'crm_campos_def', clave)
}

export type Responsable = { id: string; nombre: string }

export async function leerResponsables(): Promise<Responsable[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name')
  if (error) throw error
  return (data ?? []).map((p: { id: string; full_name: string | null }) => ({ id: p.id, nombre: p.full_name ?? p.id }))
}

export async function permisoExplicito(perm: 'ver_salud' | 'edit_salud'): Promise<boolean> {
  const { data, error } = await supabase.rpc('crm_perm_explicito', { p_perm: perm })
  if (error) return false
  return data === true
}

export async function nivelSesion(): Promise<'aal1' | 'aal2' | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const n: unknown = data?.currentLevel
  return n === 'aal1' || n === 'aal2' ? n : null
}

// ---------- Cuentas ----------

export type PaginaCuentas = { filas: Cuenta[]; total: number }

export async function buscarCuentas(f: FiltrosCrm, desde = 0, limite = 50): Promise<PaginaCuentas> {
  const { data, error } = await supabase.rpc('crm_buscar', aParametrosRpc(f, desde, limite))
  if (error) throw error
  const filas = (data ?? []) as (Cuenta & { total: number })[]
  return { filas: filas.map(({ total: _t, ...c }) => c), total: Number(filas[0]?.total ?? 0) }
}

/** Total por etapa con los demás filtros aplicados (una llamada por etapa). */
export async function contarPorEtapa(f: FiltrosCrm, etapas: string[]): Promise<Record<string, number>> {
  const pares = await Promise.all(
    etapas.map(async (e) => [e, (await buscarCuentas({ ...f, etapa: e }, 0, 1)).total] as const),
  )
  return Object.fromEntries(pares)
}

/**
 * Cuentas de la lista filtrada para exportar. crm_exportar exige
 * exportar_crm, corta en 10 000 y deja la fila crm.exportar en la auditoría.
 */
export async function cuentasParaExportar(f: FiltrosCrm): Promise<Cuenta[]> {
  const { p_limite: _l, p_desde: _d, ...filtros } = aParametrosRpc(f, 0, 1)
  const { data, error } = await supabase.rpc('crm_exportar', filtros)
  if (error) throw error
  return (data ?? []) as Cuenta[]
}

export async function leerCuenta(id: string): Promise<Cuenta> {
  const { data, error } = await supabase.from('crm_cuentas').select('*').eq('id', id).single()
  if (error) throw error
  return data as Cuenta
}

export type CambiosCuenta = Partial<Omit<Cuenta, 'id' | 'created_by' | 'created_at' | 'updated_at'>>

export async function crearCuenta(datos: CambiosCuenta): Promise<Cuenta> {
  const { data, error } = await supabase.from('crm_cuentas').insert(datos).select('*')
  if (error) throw error
  const c = afectadas(data)[0] as Cuenta
  void logAction('crm.crear', `Creó la cuenta «${c.nombre}»`, 'crm_cuentas', c.id)
  return c
}

export async function editarCuenta(id: string, cambios: CambiosCuenta): Promise<Cuenta> {
  const { data, error } = await supabase.from('crm_cuentas').update(cambios).eq('id', id).select('*')
  if (error) throw error
  const c = afectadas(data)[0] as Cuenta
  void logAction('crm.editar', `Editó la cuenta «${c.nombre}»: ${Object.keys(cambios).join(', ')}`, 'crm_cuentas', id)
  return c
}

export async function archivarCuenta(id: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('crm_cuentas')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  afectadas(data)
  void logAction(archivar ? 'crm.archivar' : 'crm.restaurar', archivar ? 'Archivó una cuenta' : 'Restauró una cuenta', 'crm_cuentas', id)
}

export async function borrarCuenta(id: string): Promise<void> {
  const { data, error } = await supabase.from('crm_cuentas').delete().eq('id', id).select('id')
  if (error) throw error
  afectadas(data)
  void logAction('crm.borrar', 'Borró una cuenta', 'crm_cuentas', id)
}

const COLS_DATOS =
  'id, tipo, nombre, documento, etapa, origen, tipo_empresa, responsable_id, telefono, email, direccion, ciudad, pais, etiquetas, campos, notas'

/** Cuentas sin archivar para cruzar la importación, por páginas de 1000. */
export async function cuentasParaImportar(): Promise<CuentaActual[]> {
  const salida: CuentaActual[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('crm_cuentas')
      .select(COLS_DATOS)
      .is('archivado_en', null)
      .order('id')
      .range(desde, desde + 999)
    if (error) throw error
    salida.push(...((data ?? []) as CuentaActual[]))
    if (!data || data.length < 1000) return salida
  }
}

export async function insertarLote(filas: DatosCuenta[]): Promise<number> {
  const { data, error } = await supabase.from('crm_cuentas').insert(filas).select('id')
  if (error) throw error
  return afectadas(data).length
}

export async function actualizarImportada(id: string, cambios: Partial<DatosCuenta>): Promise<void> {
  const { data, error } = await supabase.from('crm_cuentas').update(cambios).eq('id', id).select('id')
  if (error) throw error
  afectadas(data)
}

export function registrarImportacion(creadas: number, actualizadas: number, errores: number): void {
  void logAction('crm.importar', `Importó cuentas: ${creadas} creadas, ${actualizadas} actualizadas, ${errores} con error`, 'crm_cuentas')
}

// ---------- Contactos ----------

export type ContactoConCuenta = Contacto & { crm_cuentas: { nombre: string } | null }

export type FiltrosContactos = { q: string; archivados: boolean }

function patron(q: string): string {
  return '%' + q.trim().replace(/[\\%_]/g, (c) => '\\' + c).replace(/[,()]/g, ' ') + '%'
}

export async function buscarContactos(f: FiltrosContactos, desde = 0, limite = 50): Promise<{ filas: ContactoConCuenta[]; total: number }> {
  let q = supabase
    .from('crm_contactos')
    .select('*, crm_cuentas(nombre)', { count: 'exact' })
    .order('nombre')
    .order('id')
    .range(desde, desde + limite - 1)
  if (!f.archivados) q = q.is('archivado_en', null)
  if (f.q.trim()) {
    const p = patron(f.q)
    q = q.or(`nombre.ilike.${p},email.ilike.${p},telefono.ilike.${p}`)
  }
  const { data, error, count } = await q
  if (error) throw error
  return { filas: (data ?? []) as ContactoConCuenta[], total: count ?? 0 }
}

export async function contactosDeCuenta(cuentaId: string): Promise<Contacto[]> {
  const { data, error } = await supabase
    .from('crm_contactos')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .order('principal', { ascending: false })
    .order('nombre')
  if (error) throw error
  return (data ?? []) as Contacto[]
}

export async function leerContacto(id: string): Promise<ContactoConCuenta> {
  const { data, error } = await supabase.from('crm_contactos').select('*, crm_cuentas(nombre)').eq('id', id).single()
  if (error) throw error
  return data as ContactoConCuenta
}

export type CambiosContacto = Partial<Omit<Contacto, 'id' | 'created_at' | 'updated_at'>>

export async function guardarContacto(id: string | null, datos: CambiosContacto): Promise<Contacto> {
  const consulta = id
    ? supabase.from('crm_contactos').update(datos).eq('id', id)
    : supabase.from('crm_contactos').insert(datos)
  const { data, error } = await consulta.select('*')
  if (error) throw error
  const c = afectadas(data)[0] as Contacto
  void logAction(id ? 'crm.contacto_editar' : 'crm.contacto_crear', `Contacto «${c.nombre}»`, 'crm_contactos', c.id)
  return c
}

export async function archivarContacto(id: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('crm_contactos')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  afectadas(data)
  void logAction(archivar ? 'crm.contacto_archivar' : 'crm.contacto_restaurar', 'Contacto', 'crm_contactos', id)
}

export async function borrarContacto(id: string): Promise<void> {
  const { data, error } = await supabase.from('crm_contactos').delete().eq('id', id).select('id')
  if (error) throw error
  afectadas(data)
  void logAction('crm.contacto_borrar', 'Borró un contacto', 'crm_contactos', id)
}

// ---------- Actividades e historial ----------

export async function leerActividades(destino: { cuenta_id?: string; contacto_id?: string }): Promise<Actividad[]> {
  let q = supabase.from('crm_actividades').select('*').order('fecha', { ascending: false }).limit(200)
  if (destino.cuenta_id) q = q.eq('cuenta_id', destino.cuenta_id)
  if (destino.contacto_id) q = q.eq('contacto_id', destino.contacto_id)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Actividad[]
}

export type DatosActividad = {
  tipo: TipoActividad
  cuenta_id: string | null
  contacto_id: string | null
  fecha: string
  asunto: string
  detalle: string | null
}

export async function guardarActividad(id: string | null, datos: DatosActividad): Promise<Actividad> {
  const consulta = id
    ? supabase.from('crm_actividades').update(datos).eq('id', id)
    : supabase.from('crm_actividades').insert(datos)
  const { data, error } = await consulta.select('*')
  if (error) throw error
  const a = afectadas(data)[0] as Actividad
  void logAction(id ? 'crm.actividad_editar' : 'crm.actividad_crear', `Actividad «${a.asunto}»`, 'crm_actividades', a.id)
  return a
}

export async function borrarActividad(id: string): Promise<void> {
  const { data, error } = await supabase.from('crm_actividades').delete().eq('id', id).select('id')
  if (error) throw error
  afectadas(data)
  void logAction('crm.actividad_borrar', 'Borró una actividad', 'crm_actividades', id)
}

export type Cambio = {
  id: number
  entidad: string
  entidad_id: string
  operacion: 'insert' | 'update' | 'delete'
  campos: string[]
  autor_id: string | null
  created_at: string
}

export async function leerHistorial(entidad: 'cuenta' | 'contacto', id: string): Promise<Cambio[]> {
  const { data, error } = await supabase
    .from('crm_cambios')
    .select('id, entidad, entidad_id, operacion, campos, autor_id, created_at')
    .eq('entidad', entidad)
    .eq('entidad_id', id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as Cambio[]
}

// ---------- Consentimientos ----------

export type TipoConsentimiento = 'tratamiento_datos' | 'datos_salud'
export type MedioConsentimiento = 'escrito' | 'digital' | 'verbal_grabado'

export type Consentimiento = {
  id: string
  cuenta_id: string
  tipo: TipoConsentimiento
  otorgado: boolean
  fecha: string
  medio: MedioConsentimiento
  version_texto: string
  archivo_ruta: string | null
  registrado_por: string | null
  revocado_en: string | null
  created_at: string
}

export const BUCKET_CONSENTIMIENTOS = 'crm-consentimientos'

export async function leerConsentimientos(cuentaId: string): Promise<Consentimiento[]> {
  const { data, error } = await supabase
    .from('crm_consentimientos')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Consentimiento[]
}

/** Nombre de archivo que cumple el CHECK de archivo_ruta. */
export function nombreArchivoSeguro(nombre: string, ahora = Date.now()): string {
  const punto = nombre.lastIndexOf('.')
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${ahora}-${base || 'archivo'}${ext ? '.' + ext.slice(0, 8) : ''}`
}

export type NuevoConsentimiento = {
  tipo: TipoConsentimiento
  otorgado: boolean
  fecha: string
  medio: MedioConsentimiento
  version_texto: string
}

export async function registrarConsentimiento(cuentaId: string, datos: NuevoConsentimiento, archivo: File | null): Promise<void> {
  let archivo_ruta: string | null = null
  if (archivo) {
    archivo_ruta = `${cuentaId}/${nombreArchivoSeguro(archivo.name)}`
    const { error } = await supabase.storage
      .from(BUCKET_CONSENTIMIENTOS)
      .upload(archivo_ruta, archivo, { upsert: false, contentType: archivo.type })
    if (error) throw error
  }
  const { data, error } = await supabase
    .from('crm_consentimientos')
    .insert({ ...datos, cuenta_id: cuentaId, archivo_ruta })
    .select('id')
  if (error) throw error
  const id = afectadas(data)[0].id as string
  void logAction('crm.consentimiento_crear', `Consentimiento ${datos.tipo} (${datos.otorgado ? 'otorgado' : 'negado'})`, 'crm_consentimientos', id)
}

export async function revocarConsentimiento(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('crm_consentimientos')
    .update({ revocado_en: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw error
  afectadas(data)
  void logAction('crm.consentimiento_revocar', 'Revocó un consentimiento', 'crm_consentimientos', id)
}

export async function urlConsentimiento(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_CONSENTIMIENTOS).createSignedUrl(ruta, 60)
  if (error) throw error
  return data.signedUrl
}

// ---------- Salud (PP-DEC-19): solo por RPC, sin caché ni auditoría con datos ----------

export const CAMPOS_SALUD = ['diagnosticos', 'medicamentos', 'alergias', 'antecedentes', 'observaciones'] as const
export type CampoSalud = (typeof CAMPOS_SALUD)[number]
export type DatosSalud = Record<CampoSalud, string>

/** Normaliza lo que devuelve crm_salud_leer: texto o lista de textos por campo. */
export function leerDatosSalud(v: unknown): DatosSalud {
  const o = (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  const salida = {} as DatosSalud
  for (const k of CAMPOS_SALUD) {
    const x = o[k]
    salida[k] = typeof x === 'string' ? x : Array.isArray(x) ? x.filter((s) => typeof s === 'string').join('\n') : ''
  }
  return salida
}

export async function saludLeer(cuentaId: string): Promise<DatosSalud> {
  const { data, error } = await supabase.rpc('crm_salud_leer', { p_cuenta: cuentaId })
  if (error) throw error
  return leerDatosSalud(data)
}

export async function saludGuardar(cuentaId: string, datos: DatosSalud): Promise<void> {
  const limpio: Partial<DatosSalud> = {}
  for (const k of CAMPOS_SALUD) if (datos[k].trim()) limpio[k] = datos[k].trim()
  const { error } = await supabase.rpc('crm_salud_guardar', { p_cuenta: cuentaId, p_datos: limpio })
  if (error) throw error
  void logAction('crm.salud_guardar', 'Guardó datos de salud', 'crm_cuentas', cuentaId)
}

export async function saludBorrar(cuentaId: string): Promise<void> {
  const { error } = await supabase.rpc('crm_salud_borrar', { p_cuenta: cuentaId })
  if (error) throw error
  void logAction('crm.salud_borrar', 'Borró datos de salud', 'crm_cuentas', cuentaId)
}
