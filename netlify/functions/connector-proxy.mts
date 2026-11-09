import { z } from 'zod'
import { moduloDeAccion } from '../../src/lib/modulos.ts'
import {
  autenticar,
  exigir,
  limiteBase,
  respuesta,
  tokenDeCabecera,
  type ContextoAuth,
  type FalloAuth,
  type Requisitos,
} from '../lib/autorizacion.mts'
import { leerModulos, limiteDe, type FilaModulo } from '../lib/modulos-instalacion.mts'
import { ACCIONES as NUCLEO, type AccionProxy } from '../lib/modulos/nucleo.mts'

// Proxy único de acciones (N-6), reescrito para el producto. Compone las
// acciones que aporta cada netlify/lib/modulos/<slug>.mts; cada una hereda
// el módulo que le asigna el registro (moduloDeAccion), así una acción de un
// módulo inactivo responde 403 modulo_inactivo a todos. Orden fijo:
// autenticar, validar el cuerpo (.strict()), exigir y ejecutar. Los errores
// hacia el cliente son genéricos; el detalle queda en el log.

const FUENTES: readonly Record<string, AccionProxy>[] = [NUCLEO]

export type AccionCompuesta = AccionProxy & { requisitos: Requisitos & { modulo: string } }

export function componer(fuentes: readonly Record<string, AccionProxy>[]): Record<string, AccionCompuesta> {
  const todas: Record<string, AccionCompuesta> = {}
  for (const fuente of fuentes) {
    for (const [nombre, accion] of Object.entries(fuente)) {
      const modulo = moduloDeAccion(nombre)
      if (!modulo) throw new Error(`connector-proxy: la acción ${nombre} no figura en el registro`)
      if (todas[nombre]) throw new Error(`connector-proxy: acción repetida ${nombre}`)
      todas[nombre] = { ...accion, requisitos: { ...accion.requisitos, modulo } }
    }
  }
  return todas
}

export const ACCIONES = componer(FUENTES)
const NOMBRES = Object.keys(ACCIONES) as [string, ...string[]]

export const REQUISITOS: Record<string, AccionCompuesta['requisitos']> = Object.fromEntries(
  Object.entries(ACCIONES).map(([n, a]) => [n, a.requisitos]),
)

export const bodySchema = z
  .object({
    action: z.enum(NOMBRES),
    datos: z.unknown().optional(),
  })
  .strict()

// Cupo de IA con los límites del módulo ia (PP-LIM). Cerrado: si la RPC
// falla no se genera. null en un límite = sin límite.
export async function limiteIA(
  ctx: Pick<ContextoAuth, 'admin' | 'userId'>,
  modulos: readonly FilaModulo[],
): Promise<FalloAuth | null> {
  const hora = limiteDe(modulos, 'ia', 'ia_hora_miembro')
  if (hora !== null) {
    const f = await limiteBase(ctx, `ia:${ctx.userId}`, 3600, hora, { cerrado: true })
    if (f) return f
  }
  const dia = limiteDe(modulos, 'ia', 'ia_dia_equipo')
  if (dia !== null) {
    const f = await limiteBase(ctx, 'ia:equipo', 86_400, dia, { cerrado: true })
    if (f) return f
  }
  return null
}

const json = (status: number, cuerpo: unknown) => Response.json(cuerpo, { status })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  const auth = await autenticar(tokenDeCabecera(req.headers.get('authorization')), {
    maxPorMinuto: 60,
    accion: 'connector-proxy',
  })
  if (auth.fallo) return respuesta(auth.fallo)
  const { ctx } = auth

  let cuerpo: z.infer<typeof bodySchema>
  try {
    cuerpo = bodySchema.parse(await req.json())
  } catch {
    return json(400, { error: 'Cuerpo de la solicitud inválido' })
  }
  const accion = ACCIONES[cuerpo.action]
  if (!accion) return json(400, { error: 'Acción no válida' })
  const datos = accion.datos.safeParse(cuerpo.datos ?? {})
  if (!datos.success) return json(400, { error: 'Cuerpo de la solicitud inválido' })

  const negado = await exigir(ctx, accion.requisitos, cuerpo.action)
  if (negado) return respuesta(negado)

  // exigir ya leyó los módulos (requisitos.modulo siempre presente): sale de la caché
  const modulos = await leerModulos(ctx.admin)
  if (!modulos) return json(500, { error: 'Error verificando los permisos' })
  if (accion.requisitos.limiteIA) {
    const cupo = await limiteIA(ctx, modulos)
    if (cupo) return respuesta(cupo)
  }

  try {
    return await accion.ejecutar(ctx, datos.data, modulos)
  } catch (err) {
    console.error('connector-proxy:', cuerpo.action, err instanceof Error ? err.name : 'Error')
    return json(500, { error: 'No se pudo completar la acción' })
  }
}
