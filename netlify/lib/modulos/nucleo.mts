import { z } from 'zod'
import { MODULOS } from '../../../src/lib/modulos.ts'
import type { ContextoAuth, Requisitos } from '../autorizacion.mts'
import { emailConfigured } from '../email.mts'
import { resumenError } from '../errores.mts'
import { slugsActivos, type FilaModulo } from '../modulos-instalacion.mts'

// Acciones del proxy que aporta el núcleo (N-6). Cada archivo de
// netlify/lib/modulos/ exporta ACCIONES con la misma forma; connector-proxy
// las compone y cada acción hereda el módulo que el registro le asigna
// (moduloDeAccion), así que una acción que el registro no declara no carga.

export type AccionProxy = {
  requisitos: Requisitos & { limiteIA?: boolean }
  // Cuerpo propio de la acción (campo datos del proxy), siempre .strict()
  datos: z.ZodType
  ejecutar: (ctx: ContextoAuth, datos: unknown, modulos: readonly FilaModulo[]) => Promise<Response>
}

const sinDatos = z.object({}).strict()

// Miembros para los selectores (asignar, invitar a reuniones): cualquier
// miembro con sesión. Sin las cuentas de servicio (profiles.es_servicio).
async function listarMiembros(ctx: ContextoAuth): Promise<Response> {
  const { data, error } = await ctx.admin
    .from('profiles')
    .select('id, full_name, cargo, area')
    .eq('es_servicio', false)
  if (error || !data) {
    console.error('list-members:', resumenError(error))
    return Response.json({ error: 'No se pudo listar los miembros' }, { status: 500 })
  }
  type Fila = { id: string; full_name: string | null; cargo?: string | null; area?: string | null }
  const members = (data as Fila[])
    .map((p) => ({
      id: p.id,
      name: (p.full_name ?? '').trim() || '(sin nombre)',
      cargo: (p.cargo ?? '').trim(),
      area: (p.area ?? '').trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return Response.json({ members })
}

// Estado de los conectores de los módulos activos para Administración →
// Módulos. Solo se comprueba lo que el núcleo sabe mirar sin red (correo:
// variables SMTP); el resto queda «sin_comprobar» hasta que llegue su módulo.
export function estadoConectores(modulos: readonly FilaModulo[], correoListo: boolean): Record<string, string> {
  const activos = slugsActivos(modulos)
  const estado: Record<string, string> = {}
  for (const m of MODULOS) {
    if (!activos.includes(m.slug)) continue
    for (const c of m.conectores) {
      estado[c] = c === 'correo' ? (correoListo ? 'configurado' : 'sin_configurar') : 'sin_comprobar'
    }
  }
  return estado
}

export const ACCIONES: Record<string, AccionProxy> = {
  'list-members': { requisitos: {}, datos: sinDatos, ejecutar: (ctx) => listarMiembros(ctx) },
  'instalacion-estado-conectores': {
    requisitos: { soloAdmin: true },
    datos: sinDatos,
    ejecutar: async (_ctx, _datos, modulos) =>
      Response.json({ conectores: estadoConectores(modulos, emailConfigured()) }),
  },
}
