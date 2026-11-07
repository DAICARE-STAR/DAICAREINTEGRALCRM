import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Pruebas estáticas del esquema consolidado (supabase/esquema/NN-*.sql),
// leído como texto: no hace falta una base. Patrón de
// migraciones-seguridad.test.ts de team-portal.

const CARPETA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
const PATRON = /^(\d{2})[a-z]?-[a-z0-9-]+\.sql$/
const NUCLEO_PR4 = ['00-base.sql', '01-seguridad.sql', '02-auditoria.sql', '03-mfa.sql']

const archivos = readdirSync(CARPETA)
  .filter((n) => PATRON.test(n))
  .sort()
  .map((nombre) => {
    const texto = readFileSync(CARPETA + nombre, 'utf8').replace(/\r\n?/g, '\n')
    return { nombre, texto, sql: sinComentarios(texto) }
  })

function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

type Funcion = { nombre: string; cabecera: string; esTrigger: boolean; definer: boolean }

// Definiciones de función de public: nombre, cabecera (de los argumentos
// hasta «as $tag$») y si es de trigger o security definer. Los argumentos
// pueden traer paréntesis (default auth.uid()).
function funciones(sql: string): Funcion[] {
  const salida: Funcion[] = []
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    let i = re.lastIndex
    let nivel = 1
    while (i < sql.length && nivel > 0) {
      if (sql[i] === '(') nivel++
      else if (sql[i] === ')') nivel--
      i++
    }
    const resto = sql.slice(i)
    const fin = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(resto)
    const cabecera = fin ? resto.slice(0, fin.index) : resto.slice(0, 400)
    salida.push({
      nombre: m[1],
      cabecera,
      esTrigger: /returns\s+trigger\b/i.test(cabecera),
      definer: /security\s+definer/i.test(cabecera),
    })
  }
  return salida
}

const tablas = (sql: string) =>
  [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map((m) => m[1])

const revocaA = (sql: string, nombre: string, roles: string) =>
  new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${nombre}\\s*\\([^;]*\\)\\s+from\\s+${roles}`, 'i').test(sql)

describe('esquema consolidado: archivos', () => {
  it('el núcleo 00-03 existe con su nombre', () => {
    const nombres = archivos.map((a) => a.nombre)
    for (const n of NUCLEO_PR4) expect(nombres).toContain(n)
  })

  it.each(archivos.map((a) => [a.nombre, a] as const))('%s tiene bloque 0 de requisitos y verificación al final', (_n, a) => {
    const requisitos = a.texto.indexOf('-- ============ 0) Requisitos')
    const verificacion = a.texto.lastIndexOf('-- ============ Verificación')
    expect(requisitos).toBeGreaterThan(-1)
    expect(verificacion).toBeGreaterThan(requisitos)
    // El bloque 0 aborta con raise exception; la verificación también
    const bloque0 = a.texto.slice(requisitos, a.texto.indexOf('end $$;', requisitos))
    expect(bloque0).toMatch(/raise\s+exception/i)
    expect(a.texto.slice(verificacion)).toMatch(/do \$\$[\s\S]*raise\s+exception[\s\S]*end \$\$;\s*$/i)
  })

  it.each(archivos.map((a) => [a.nombre, a] as const))('%s no lleva marca, correos ni emojis de una instalación', (_n, a) => {
    expect(a.texto).not.toMatch(/luce/i)
    expect(a.texto).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/)
    expect(a.texto).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it.each(archivos.map((a) => [a.nombre, a] as const))('%s es idempotente en tablas, triggers y políticas', (_n, a) => {
    expect(a.sql).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists)/i)
    expect(a.sql).not.toMatch(/create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/i)
    expect(a.sql).not.toMatch(/create\s+function/i)
    for (const m of a.sql.matchAll(/create\s+trigger\s+(\w+)\s+[\s\S]*?\bon\s+([\w.]+)/gi)) {
      expect(a.sql).toMatch(new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${m[1]}\\s+on\\s+${m[2].replace('.', '\\.')}`, 'i'))
    }
    for (const m of a.sql.matchAll(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+([\w.]+)/gi)) {
      // Las de aplicar_exigir_mfa se crean solo si faltan (dentro de format)
      if (m[1] === 'exigir_mfa') continue
      const nombre = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(a.sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${nombre}\\s+on\\s+${m[2].replace('.', '\\.')}`, 'i'))
    }
  })
})

describe('esquema consolidado: tablas', () => {
  it.each(archivos.map((a) => [a.nombre, a] as const))('%s: toda tabla con RLS, revoke all y grant explícito', (_n, a) => {
    for (const t of tablas(a.sql)) {
      expect(a.sql, t).toMatch(new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
      expect(a.sql, t).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+(?:[\\w.]+,\\s*)*public\\.${t}\\b[^;]*\\bfrom\\s+anon,\\s*authenticated`, 'i'))
      expect(a.sql, t).toMatch(new RegExp(`grant\\s+[^;]+\\s+on\\s+table\\s+(?:[\\w.]+,\\s*)*public\\.${t}\\b[^;]*\\bto\\s`, 'i'))
    }
  })

  it('roles trae funcion con su lista cerrada y un rol por función', () => {
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    expect(base).toMatch(/funcion\s+text\s+constraint\s+roles_funcion_check\s+check\s*\(funcion is null or funcion in \('aviso_leads', 'aviso_perdidas', 'qa'\)\)/i)
    expect(base).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+roles_funcion_unica\s+on\s+public\.roles\s*\(funcion\)\s+where\s+funcion\s+is\s+not\s+null/i)
  })

  it('profiles trae es_servicio y el freno solo deja cambiarlo a un administrador o sin sesión', () => {
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    expect(base).toMatch(/es_servicio\s+boolean\s+not\s+null\s+default\s+false/i)
    expect(base).toMatch(/new\.es_servicio is distinct from old\.es_servicio\s+and auth\.uid\(\) is not null and not public\.is_admin\(\)/i)
  })

  it('las semillas son solo los roles de sistema admin y member', () => {
    const inserts = archivos.flatMap((a) => [...a.sql.matchAll(/insert\s+into\s+public\.(\w+)/gi)].map((m) => `${a.nombre}:${m[1]}`))
    // 02 y 01 insertan desde funciones (audit_log, api_rate_limits) y la fila única de interruptores
    expect(inserts.filter((i) => i.endsWith(':roles'))).toEqual(['00-base.sql:roles'])
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    const semilla = /insert\s+into\s+public\.roles[^;]*;/i.exec(base)![0]
    expect([...semilla.matchAll(/\('(\w+)',/g)].map((m) => m[1])).toEqual(['admin', 'member'])
  })

  it('audit_log es inmutable: sin políticas ni grants de update o delete', () => {
    const aud = archivos.find((a) => a.nombre === '02-auditoria.sql')!.sql
    expect(aud).not.toMatch(/create\s+policy[^;]+on\s+public\.audit_log\s+for\s+(?:update|delete|all)/i)
    expect(aud).toMatch(/revoke\s+all\s+on\s+table\s+public\.audit_log\s+from\s+anon,\s*authenticated,\s*service_role/i)
    expect(aud).not.toMatch(/grant\s+[^;]*(?:update|delete|all)[^;]*on\s+table\s+public\.audit_log/i)
  })
})

describe('esquema consolidado: funciones', () => {
  const todas = archivos.flatMap((a) => funciones(a.sql).map((f) => ({ ...f, archivo: a.nombre, sql: a.sql })))

  it('encuentra las funciones del núcleo', () => {
    const nombres = todas.map((f) => f.nombre)
    for (const n of ['is_admin', 'has_perm', 'get_my_role', 'shares_role', 'permisos_solo_admin', 'roles_guard_escalada',
                     'rate_limit_hit', 'cuentas_servicio_ids', 'auditar_cambio', 'seguridad_resumen', 'mfa_ok', 'aplicar_exigir_mfa']) {
      expect(nombres).toContain(n)
    }
  })

  it.each(todas.map((f) => [`${f.archivo} ${f.nombre}`, f] as const))('%s fija search_path', (_n, f) => {
    expect(f.cabecera).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i)
  })

  it.each(todas.filter((f) => f.definer).map((f) => [`${f.archivo} ${f.nombre}`, f] as const))('%s (security definer) revoca EXECUTE a public y anon', (_n, f) => {
    expect(revocaA(f.sql, f.nombre, 'public,\\s*anon')).toBe(true)
  })

  it.each(todas.filter((f) => f.esTrigger).map((f) => [`${f.archivo} ${f.nombre}`, f] as const))('%s (trigger) queda cerrada a public, anon y authenticated', (_n, f) => {
    expect(revocaA(f.sql, f.nombre, 'public,\\s*anon,\\s*authenticated')).toBe(true)
  })

  // Regla de la 87: desde los privilegios por defecto nada se hereda; cada
  // función no trigger declara quién la ejecuta o queda cerrada a todos
  it.each(todas.filter((f) => !f.esTrigger).map((f) => [`${f.archivo} ${f.nombre}`, f] as const))('%s tiene grant execute explícito o queda solo para el dueño', (_n, f) => {
    const grant = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${f.nombre}\\s*\\([^;]*\\)\\s+to\\s`, 'i').test(f.sql)
    expect(grant || revocaA(f.sql, f.nombre, 'public,\\s*anon,\\s*authenticated')).toBe(true)
  })

  it('seguridad_resumen() y rate_limit_hit() son solo de la service role', () => {
    const sql = archivos.map((a) => a.sql).join('\n')
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.seguridad_resumen\(\)\s+to\s+service_role;/i)
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.rate_limit_hit\(text, int, int\)\s+to\s+service_role;/i)
  })

  it('los privilegios por defecto de la 87 van antes que cualquier función de 01 en adelante', () => {
    const seg = archivos.find((a) => a.nombre === '01-seguridad.sql')!.sql
    const defecto = seg.search(/alter\s+default\s+privileges\s+for\s+role\s+postgres\s+revoke\s+execute\s+on\s+functions\s+from\s+public/i)
    expect(defecto).toBeGreaterThan(-1)
    expect(defecto).toBeLessThan(seg.search(/create\s+or\s+replace\s+function/i))
    expect(seg).toMatch(/in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+anon/i)
    expect(seg).toMatch(/in\s+schema\s+public\s+revoke\s+all\s+on\s+tables\s+from\s+anon/i)
  })

  it('roles_guard_escalada protege los roles de sistema y los que tienen funcion, sin lista de nombres', () => {
    const f = /function\s+public\.roles_guard_escalada\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(archivos.map((a) => a.sql).join('\n'))![1]
    expect(f).toMatch(/old\.is_system or old\.funcion is not null/i)
    expect(f).toMatch(/new\.funcion is distinct from old\.funcion/i)
    expect(f).not.toMatch(/v_reservados/i)
  })

  it('aplicar_exigir_mfa() crea la política restrictiva en public y en storage.objects y solo la ejecuta el dueño', () => {
    const mfa = archivos.find((a) => a.nombre === '03-mfa.sql')!.sql
    const cuerpo = /function\s+public\.aplicar_exigir_mfa\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(mfa)![1]
    expect(cuerpo).toMatch(/create policy exigir_mfa on public\.%I as restrictive for all to authenticated using \(\(select public\.mfa_ok\(\)\)\)/)
    expect(cuerpo).toMatch(/create policy exigir_mfa on storage\.objects as restrictive for all to authenticated/)
    expect(cuerpo).toMatch(/not exists/i)
    expect(mfa).not.toMatch(/function\s+public\.aplicar_exigir_mfa\(\)[^$]*security\s+definer/i)
    expect(mfa).toMatch(/revoke\s+execute\s+on\s+function\s+public\.aplicar_exigir_mfa\(\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i)
    expect(mfa).toMatch(/select\s+public\.aplicar_exigir_mfa\(\);/i)
  })
})

describe('lector de funciones', () => {
  it('acepta argumentos con paréntesis y distingue trigger y definer', () => {
    const fs = funciones(`
      create or replace function public.a(uid uuid default auth.uid())
      returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select true $$;
      create or replace function public.b() returns trigger language plpgsql set search_path = public, pg_temp as $$ begin return new; end $$;`)
    expect(fs.map((f) => [f.nombre, f.definer, f.esTrigger])).toEqual([['a', true, false], ['b', false, true]])
  })
})
