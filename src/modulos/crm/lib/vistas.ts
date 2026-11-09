import type { Cuenta as Contador } from '../../../lib/resumen'
import { etapasOrdenadas } from './catalogos'
import type { Consentimiento } from './datos'
import type { FilaImportada } from './importador'
import type { AjustesCrm, TipoCuenta } from './tipos'

// Reglas puras de las vistas del CRM.

export type PestanaFicha = 'datos' | 'contactos' | 'actividades' | 'historial' | 'salud' | 'consentimientos'

/** Pestañas de la ficha de cuenta: Salud y Consentimientos solo en personas; Salud además con ver_salud explícito. */
export function pestanasCuenta(tipo: TipoCuenta, verSalud: boolean): { id: PestanaFicha; label: string; grupo: string }[] {
  const base: { id: PestanaFicha; label: string; grupo: string }[] = [
    { id: 'datos', label: 'Datos', grupo: 'ficha' },
    { id: 'contactos', label: 'Contactos', grupo: 'ficha' },
    { id: 'actividades', label: 'Actividades', grupo: 'ficha' },
    { id: 'historial', label: 'Historial', grupo: 'ficha' },
  ]
  if (tipo !== 'persona') return base
  if (verSalud) base.push({ id: 'salud', label: 'Salud', grupo: 'persona' })
  base.push({ id: 'consentimientos', label: 'Consentimientos', grupo: 'persona' })
  return base
}

/** El vigente es el registrado más reciente de su tipo (created_at, hora del servidor; empata por id), otorgado y sin revocar, como crm_salud_guardar. La fecha del documento no decide. */
export function consentimientoVigente(lista: Consentimiento[], tipo: Consentimiento['tipo']): boolean {
  const ultimo = lista
    .filter((c) => c.tipo === tipo)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]
  return !!ultimo && ultimo.otorgado && ultimo.revocado_en === null
}

/** Contadores del Resumen por etapa; cada uno filtra por su etapa. */
export function contadoresEtapa(ajustes: AjustesCrm, conteo: Record<string, number>, activa: string): Contador[] {
  return etapasOrdenadas(ajustes).map((e) => ({
    n: conteo[e.clave] ?? 0,
    label: e.nombre,
    filtro: `etapa|${e.clave}`,
    activa: activa === e.clave,
  }))
}

/** Etiquetas separadas por coma o barra vertical, sin vacías ni repetidas. */
export function partirEtiquetas(texto: string): string[] {
  const vistas = new Set<string>()
  for (const t of texto.split(/[,|]/)) {
    const v = t.trim().toLowerCase()
    if (v) vistas.add(v)
  }
  return [...vistas]
}

export const textoNulo = (s: string): string | null => (s.trim() === '' ? null : s.trim())

const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })

export const fmtFecha = (iso: string) => (iso.length === 10 ? FECHA.format(new Date(iso + 'T12:00:00Z')) : FECHA.format(new Date(iso)))
export const fmtFechaHora = (iso: string) => FECHA_HORA.format(new Date(iso))

export const TIPOS_ACTIVIDAD = [
  { valor: 'nota', label: 'Nota' },
  { valor: 'llamada', label: 'Llamada' },
  { valor: 'reunion', label: 'Reunión' },
  { valor: 'correo', label: 'Correo' },
  { valor: 'visita', label: 'Visita' },
] as const

export const nombreTipoActividad = (t: string) => TIPOS_ACTIVIDAD.find((x) => x.valor === t)?.label ?? t

// ---------- Importación ----------

export type Conteo = { crear: number; actualizar: number; sin_cambio: number; error: number }

export function contarImportacion(filas: FilaImportada[]): Conteo {
  const c: Conteo = { crear: 0, actualizar: 0, sin_cambio: 0, error: 0 }
  for (const f of filas) c[f.accion]++
  return c
}

const ACCION: Record<FilaImportada['accion'], string> = {
  crear: 'crear',
  actualizar: 'actualizar',
  sin_cambio: 'sin cambio',
  error: 'error',
}

/**
 * Filas del reporte CSV: número de fila del archivo, acción prevista y
 * resultado. `escritura` trae el error de escritura por fila (o null si se
 * escribió); una fila sin entrada no se llegó a escribir (cancelada).
 */
export function filasReporte(filas: FilaImportada[], escritura: Map<number, string | null>): string[][] {
  return [
    ['Fila', 'Acción', 'Resultado'],
    ...filas.map((f) => {
      let resultado: string
      if (f.accion === 'error') resultado = f.errores.join('; ')
      else if (f.accion === 'sin_cambio') resultado = 'sin cambio'
      else if (!escritura.has(f.fila)) resultado = 'no escrita'
      else resultado = escritura.get(f.fila) ?? 'escrita'
      return [String(f.fila), ACCION[f.accion], resultado]
    }),
  ]
}
