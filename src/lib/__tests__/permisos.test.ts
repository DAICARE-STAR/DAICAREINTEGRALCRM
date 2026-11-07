import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// permisos_solo_admin() (01-seguridad.sql) es la lista que usa el trigger
// roles_guard_escalada. El shell (src/types.ts) y las funciones
// (netlify/lib/autorizacion.mts) tendrán su copia PERMISOS_SOLO_ADMIN
// cuando lleguen con el commit de origen (N-1): desde ese momento esta
// prueba compara las tres. Si divergen, la matriz de Roles deja marcar algo
// que la base rechaza, o bloquea algo que la base permite.

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const SEGURIDAD = readFileSync(RAIZ + 'supabase/esquema/01-seguridad.sql', 'utf8')

// Las doce claves de la migración 88 de team-portal
const DOCE = [
  'manage_roles', 'manage_members', 'manage_apps', 'manage_connectors',
  'view_credentials', 'manage_credentials', 'view_mail', 'view_billing',
  'bot_asistente', 'ia_worker', 'delete_projects', 'delete_tender_offers',
]

// Lista de permisos_solo_admin() leída como texto: quita comentarios, toma
// la última definición y acepta array['a','b'] o '{a,b}'.
function listaSqlSoloAdmin(sql: string): string[] | null {
  const limpio = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
  const defs = [
    ...limpio.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?permisos_solo_admin\s*\(\s*\)[\s\S]*?(\$[A-Za-z_]*\$)([\s\S]*?)\1/gi
    ),
  ]
  const cuerpo = defs.length ? defs[defs.length - 1][2] : null
  if (!cuerpo) return null
  const arr = /array\s*\[([\s\S]*?)\]/i.exec(cuerpo)
  if (arr) return [...arr[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
  const lit = /'\{([^}]*)\}'/.exec(cuerpo)
  if (lit) return lit[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
  return null
}

// PERMISOS_SOLO_ADMIN = [ ... ] de un texto TS, o null si no la declara con
// esa forma. Solo se salta la comparación si el archivo no existe: si existe
// y la lista no se lee, la prueba falla (no se compara en silencio).
function listaTs(texto: string): string[] | null {
  const m = /PERMISOS_SOLO_ADMIN[^=]*=\s*\[([\s\S]*?)\]/.exec(texto)
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null
}

const ordenada = (l: readonly string[]) => [...l].sort()
const SQL = listaSqlSoloAdmin(SEGURIDAD)

describe('permisos_solo_admin() de 01-seguridad.sql', () => {
  it('se lee y tiene las doce claves de la 88, sin repetir', () => {
    expect(SQL).not.toBeNull()
    expect(new Set(SQL).size).toBe(SQL!.length)
    expect(ordenada(SQL!)).toEqual(ordenada(DOCE))
  })

  it('cada clave tiene la forma verbo_objeto', () => {
    for (const p of SQL!) expect(p).toMatch(/^[a-z]+_[a-z]+(?:_[a-z]+)*$/)
  })

  for (const ruta of ['src/types.ts', 'netlify/lib/autorizacion.mts']) {
    it.skipIf(!existsSync(RAIZ + ruta))(`coincide con PERMISOS_SOLO_ADMIN de ${ruta}`, () => {
      const ts = listaTs(readFileSync(RAIZ + ruta, 'utf8'))
      expect(ts, `${ruta} existe pero PERMISOS_SOLO_ADMIN no se lee como = [ ... ]`).not.toBeNull()
      expect(ordenada(ts!)).toEqual(ordenada(SQL!))
    })
  }
})

describe('lectura de PERMISOS_SOLO_ADMIN desde TS', () => {
  it('lee el arreglo literal y da null con otra forma, que la prueba de arriba convierte en fallo', () => {
    expect(listaTs("export const PERMISOS_SOLO_ADMIN: readonly string[] = ['manage_roles', 'view_mail']")).toEqual(['manage_roles', 'view_mail'])
    expect(listaTs("export const PERMISOS_SOLO_ADMIN = new Set(['manage_roles'])")).toBeNull()
    expect(listaTs("export { PERMISOS_SOLO_ADMIN } from './x'")).toBeNull()
    expect(listaTs("export const SOLO_ADMIN = ['manage_roles']")).toBeNull()
  })
})

describe('lectura de permisos_solo_admin() desde el SQL', () => {
  it('toma la última definición e ignora comentarios y revoke', () => {
    const sql = `
      -- create or replace function public.permisos_solo_admin() returns text[] as $$ select array['viejo'] $$;
      create or replace function public.permisos_solo_admin()
      returns text[] language sql immutable as $$ select array['a'] $$;
      create or replace function public.permisos_solo_admin()
      returns text[] language sql immutable as $$
        select array['manage_roles','manage_members',
                     'view_billing']
      $$;
      revoke execute on function public.permisos_solo_admin() from public, anon;`
    expect(listaSqlSoloAdmin(sql)).toEqual(['manage_roles', 'manage_members', 'view_billing'])
  })

  it('acepta el literal de arreglo', () => {
    const sql = `create function permisos_solo_admin() returns text[] language sql as $f$ select '{a, "b"}'::text[] $f$;`
    expect(listaSqlSoloAdmin(sql)).toEqual(['a', 'b'])
  })
})
