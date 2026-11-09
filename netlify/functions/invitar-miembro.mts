import { z } from 'zod'
import {
  PERMISOS_SOLO_ADMIN,
  auditar,
  autenticar,
  exigir,
  limiteBase,
  respuesta,
  tokenDeCabecera,
} from '../lib/autorizacion.mts'
import { resumenError } from '../lib/errores.mts'

// Invitar a un miembro (N-7), en orden fijo: autenticar; exigir
// manage_members; validar el cuerpo (.strict()); 20 invitaciones por hora por
// quien invita; freno de escalada (quien no es admin no da admin ni roles con
// permisos solo-admin); contar contra nucleo.miembros (409 limite_miembros
// sin llamar a Auth); inviteUserByEmail con redirectTo desde process.env.URL;
// nombre y roles; auditoría 'miembro.invitar'. El trigger
// profiles_limite_miembros de 04 queda de respaldo.

const VENTANA_SEG = 3600
const MAX_POR_HORA = 20

export const cuerpoInvitar = z
  .object({
    correo: z.string().trim().toLowerCase().email().max(254),
    nombre: z.string().trim().min(1).max(120),
    roles: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  })
  .strict()

type FilaRol = { name: string; permissions: string[] | null }

// Pura: un rol que da algo solo-admin (o el propio admin) solo lo da un admin
export function rolesEscalan(filas: readonly FilaRol[]): string[] {
  return filas
    .filter((r) => r.name === 'admin' || (r.permissions ?? []).some((p) => PERMISOS_SOLO_ADMIN.includes(p)))
    .map((r) => r.name)
}

const json = (status: number, cuerpo: unknown) => Response.json(cuerpo, { status })

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  const r = await autenticar(tokenDeCabecera(req.headers.get('authorization')), {
    maxPorMinuto: 10,
    accion: 'invitar-miembro',
  })
  if (r.fallo) return respuesta(r.fallo)
  const { ctx } = r
  const { admin } = ctx

  const negado = await exigir(ctx, { permiso: 'manage_members' }, 'invitar-miembro')
  if (negado) return respuesta(negado)

  let datos: z.infer<typeof cuerpoInvitar>
  try {
    datos = cuerpoInvitar.parse(await req.json())
  } catch {
    return json(400, { error: 'Revisa el correo, el nombre y los roles.' })
  }
  const roles = [...new Set(datos.roles)]

  const tasa = await limiteBase(ctx, `invitar:${ctx.userId}`, VENTANA_SEG, MAX_POR_HORA)
  if (tasa) return respuesta(tasa)

  if (roles.length) {
    const { data, error } = await admin.from('roles').select('name, permissions').in('name', roles)
    if (error || !data) {
      console.error('invitar-miembro: roles', resumenError(error))
      return json(500, { error: 'No se pudo completar la invitación' })
    }
    const filas = data as FilaRol[]
    if (filas.length !== roles.length) return json(400, { error: 'Uno de los roles no existe.' })
    if (!ctx.esAdmin && rolesEscalan(filas).length) {
      console.warn('[seguridad] denegado', { codigo: 'sin_permiso', userId: ctx.userId, accion: 'invitar-miembro.escalada' })
      return json(403, { error: 'Solo un administrador puede dar ese rol.', codigo: 'sin_permiso' })
    }
  }

  const [limite, cuenta] = await Promise.all([
    admin.rpc('limite_modulo', { p_slug: 'nucleo', p_clave: 'miembros' }),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('es_servicio', false),
  ])
  if (limite.error || cuenta.error || cuenta.count === null) {
    console.error('invitar-miembro: límite', resumenError(limite.error ?? cuenta.error))
    return json(500, { error: 'No se pudo comprobar el límite de miembros' })
  }
  const max = typeof limite.data === 'number' ? limite.data : limite.data === null ? null : Number(limite.data)
  if (max !== null && cuenta.count >= max) {
    return json(409, {
      error: `La instalación admite ${max} miembros y ya tiene ${cuenta.count}.`,
      codigo: 'limite_miembros',
      uso: cuenta.count,
      limite: max,
    })
  }

  const url = process.env.URL
  if (!url) return json(501, { error: 'Falta la variable URL del sitio para el enlace de la invitación.', codigo: 'config' })

  const { data: invitado, error: errInvitar } = await admin.auth.admin.inviteUserByEmail(datos.correo, {
    redirectTo: url,
    data: { full_name: datos.nombre },
  })
  if (errInvitar || !invitado?.user) {
    console.error('invitar-miembro: Auth', resumenError(errInvitar))
    const yaExiste = (errInvitar as { code?: string } | null)?.code === 'email_exists'
    // Dos invitaciones a la vez con un solo cupo: el trigger diferido profiles_limite_miembros tumba la segunda
    // y Auth solo dice «Database error». Se vuelve a contar para no culpar al SMTP.
    if (!yaExiste && max !== null) {
      const otra = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('es_servicio', false)
      if (/limite_miembros/.test(errInvitar?.message ?? '') || (otra.count !== null && otra.count >= max)) {
        return json(409, { error: `La instalación admite ${max} miembros.`, codigo: 'limite_miembros', limite: max })
      }
    }
    return yaExiste
      ? json(409, { error: 'Ese correo ya tiene una cuenta.', codigo: 'ya_existe' })
      : json(502, { error: 'Supabase Auth no envió la invitación (revisa el SMTP de Auth).' })
  }
  const id = invitado.user.id

  const { error: errNombre } = await admin.from('profiles').update({ full_name: datos.nombre }).eq('id', id)
  const { error: errRoles } = roles.length
    ? await admin
        .from('user_roles')
        // El trigger profiles_seed_role ya creó (id, 'member'): sin ignorar duplicados el lote entero fallaría.
        .upsert(roles.map((role) => ({ user_id: id, role })), { onConflict: 'user_id,role', ignoreDuplicates: true })
    : { error: null }
  if (errNombre || errRoles) console.error('invitar-miembro: perfil', resumenError(errNombre ?? errRoles))

  await auditar(admin, {
    userId: ctx.userId,
    email: ctx.email,
    action: 'miembro.invitar',
    detail: `Invitó a un miembro${roles.length ? ` con ${roles.join(', ')}` : ''}`,
    entity: 'profiles',
    entityId: id,
  })

  return json(200, { id, rolesAsignados: !errRoles, nombreGuardado: !errNombre })
}
