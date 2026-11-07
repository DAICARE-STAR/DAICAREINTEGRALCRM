import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Pruebas estáticas del esquema consolidado (supabase/esquema/NN-*.sql),
// leído como texto: no hace falta una base. Patrón de
// migraciones-seguridad.test.ts de team-portal.

const CARPETA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
const PATRON = /^(\d{2})[a-z]?-[a-z0-9-]+\.sql$/
const NUCLEO_PR4 = ['00-base.sql', '01-seguridad.sql', '02-auditoria.sql', '03-mfa.sql', '04-instalacion-modulos.sql']

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
  it('el núcleo 00-04 existe con su nombre', () => {
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

describe('esquema consolidado: 04-instalacion-modulos', () => {
  const sql = archivos.find((a) => a.nombre === '04-instalacion-modulos.sql')!.sql
  const texto04 = archivos.find((a) => a.nombre === '04-instalacion-modulos.sql')!.texto
  const cuerpo = (nombre: string) => new RegExp(`function\\s+public\\.${nombre}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(sql)![1]

  it('modulos_instalacion no tiene políticas ni grants de escritura para la API', () => {
    const politicas = [...sql.matchAll(/create\s+policy\s+\S+\s+on\s+public\.modulos_instalacion\s+([^;]*);/gi)].map((m) => m[1])
    expect(politicas.length).toBe(1)
    expect(politicas[0]).toMatch(/^for\s+select\s+to\s+authenticated/i)
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.modulos_instalacion\s+from\s+anon,\s*authenticated;/i)
    const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+public\.modulos_instalacion\s+to\s+(\w+)/gi)].map((m) => [m[1].toLowerCase(), m[2]])
    expect(grants).toEqual([['select', 'authenticated'], ['all', 'service_role']])
    expect(sql).toMatch(/check\s*\(slug <> 'nucleo' or activo\)/i)
  })

  it('instalacion: fila única, lectura para todos y update solo de un administrador, sin insert ni delete', () => {
    expect(sql).toMatch(/id int primary key default 1 check \(id = 1\)/i)
    expect(sql).toMatch(/grant\s+select,\s*update\s+on\s+table\s+public\.instalacion\s+to\s+authenticated/i)
    expect(sql).not.toMatch(/grant\s+[^;]*(?:insert|delete|all)[^;]*on\s+table\s+public\.instalacion/i)
    expect(sql).toMatch(/policy\s+instalacion_update\s+on\s+public\.instalacion\s+for\s+update\s+to\s+authenticated\s+using\s+\(\(select public\.is_admin\(\)\)\)\s+with\s+check\s+\(\(select public\.is_admin\(\)\)\)/i)
    expect(sql).toMatch(/check\s*\(public\.tema_valido\(tema\)\)/i)
  })

  it.each(['has_modulo', 'puede_ver_app', 'limite_modulo', 'modulos_consumo'])('%s es security definer con search_path, revoke a public y anon y grant a authenticated', (nombre) => {
    const f = funciones(sql).find((x) => x.nombre === nombre)!
    expect(f.definer).toBe(true)
    expect(f.cabecera).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i)
    expect(revocaA(sql, nombre, 'public,\\s*anon')).toBe(true)
    expect(sql).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${nombre}\\s*\\([^;]*\\)\\s+to\\s+authenticated`, 'i'))
  })

  it('has_modulo da true al núcleo y puede_ver_app v2 exige el módulo activo antes que el permiso', () => {
    expect(cuerpo('has_modulo')).toMatch(/p_slug = 'nucleo'\s+or exists \(select 1 from public\.modulos_instalacion m where m\.slug = p_slug and m\.activo\)/i)
    expect(cuerpo('puede_ver_app')).toMatch(/public\.has_modulo\(p_slug\)\s+and \(public\.is_admin\(\) or public\.has_perm\('app_' \|\| p_slug\)\)/i)
    expect(sql).not.toMatch(/portal_apps/i)
  })

  it('modulos_consumo es solo para un administrador', () => {
    expect(cuerpo('modulos_consumo')).toMatch(/if not public\.is_admin\(\) then\s+raise exception[^;]*errcode = '42501'/i)
  })

  it('aplicar_politica_modulo crea una política restrictiva con has_modulo en un initPlan y solo la ejecuta el dueño', () => {
    const c = cuerpo('aplicar_politica_modulo')
    expect(c).toMatch(/create policy %I on %s as restrictive for all to authenticated using \(\(select public\.has_modulo\(%L\)\)\) with check \(\(select public\.has_modulo\(%L\)\)\)/)
    expect(c).toMatch(/'modulo_' \|\| v_slug/)
    expect(c).toMatch(/v_slug = 'nucleo'/)
    expect(funciones(sql).find((f) => f.nombre === 'aplicar_politica_modulo')!.definer).toBe(false)
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.aplicar_politica_modulo\(regclass, text\[\]\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i)
  })

  it('tema_valido admite solo las primitivas de public/tema.js con valores #rrggbb en minúscula', () => {
    const temaJs = readFileSync(fileURLToPath(new URL('../../../public/tema.js', import.meta.url)), 'utf8')
    const deTemaJs = [...(/var PRIMITIVAS = \[([\s\S]*?)\];/.exec(temaJs)![1].matchAll(/'([^']+)'/g))].map((m) => m[1])
    // Con el texto entero: el lector sin comentarios corta en el «--» de cada clave
    const c = /function\s+public\.tema_valido\(p_tema jsonb\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(texto04)![1]
    const deSql = [...(/array\[([\s\S]*?)\]::text\[\]/.exec(c)![1].matchAll(/'([^']+)'/g))].map((m) => m[1])
    expect(deSql.length).toBeGreaterThan(20)
    expect(deSql.sort()).toEqual(deTemaJs.sort())
    expect(c).toMatch(/jsonb_typeof\(e\.value\) <> 'string'/)
    expect(c).toContain("!~ '^#[0-9a-f]{6}$'")
    expect(/function\s+public\.tema_valido\(p_tema jsonb\)\s+returns boolean language sql immutable/i.test(sql)).toBe(true)
  })

  it('el trigger de miembros no cuenta las cuentas de servicio y la semilla trae nucleo con miembros = 10 (PP-LIM)', () => {
    const c = cuerpo('profiles_limite_miembros')
    expect(c).toMatch(/public\.limite_modulo\('nucleo', 'miembros'\)/)
    expect(c).toMatch(/new\.es_servicio/)
    expect(c).toMatch(/raw_app_meta_data ->> 'es_servicio', ''\) = 'true'\) then\s+new\.es_servicio := true;/)
    expect(c).toMatch(/where not p\.es_servicio/)
    expect(c).toMatch(/raise exception 'limite_miembros/)
    expect(sql).toMatch(/create\s+trigger\s+profiles_limite_miembros\s+before\s+insert\s+on\s+public\.profiles/i)
    expect(sql).toMatch(/values \('nucleo', true, '\{"miembros": 10\}'\)\s+on conflict \(slug\) do nothing/i)
  })
})

describe('supabase/pruebas/rls-simulacion.sql', () => {
  const sim = readFileSync(fileURLToPath(new URL('../../../supabase/pruebas/rls-simulacion.sql', import.meta.url)), 'utf8').replace(/\r\n?/g, '\n')
  const bloques = sim.split(/\n(?=-- ============ )/)

  it('va en BEGIN … ROLLBACK y termina con el resultado como error', () => {
    const codigo = sinComentarios(sim).trim()
    expect(codigo.startsWith('begin;')).toBe(true)
    expect(codigo.endsWith('rollback;')).toBe(true)
    expect(sim).toMatch(/raise exception E'rls-simulacion \(se deshace todo\)/)
    expect(sinComentarios(sim)).not.toMatch(/\bcommit\b/i)
  })

  it('tiene las secciones 0 a 7 y la 0 lee instalador.cuentas_prueba', () => {
    for (let n = 0; n <= 7; n++) expect(sim).toContain(`-- ============ ${n}) `)
    expect(bloques.find((b) => b.startsWith('-- ============ 0) '))).toMatch(/from instalador\.cuentas_prueba where rol = 'qa'/)
  })

  it('cada sección después de la 0 se niega a correr suelta', () => {
    const secciones = bloques.filter((b) => /^-- ============ [1-9]\d*\) /.test(b))
    expect(secciones.length).toBe(7)
    for (const s of secciones) expect(s).toMatch(/current_setting\('rls\.txid', true\) is distinct from txid_current\(\)::text then\s+raise exception/)
  })

  it('no lleva marca, correos ni emojis de una instalación', () => {
    expect(sim).not.toMatch(/luce/i)
    expect(sim).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/)
    expect(sim).not.toMatch(/\p{Extended_Pictographic}/u)
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
