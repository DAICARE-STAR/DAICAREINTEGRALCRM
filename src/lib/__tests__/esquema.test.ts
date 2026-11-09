import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Pruebas estáticas del esquema consolidado (supabase/esquema/NN-*.sql),
// leído como texto: no hace falta una base. Patrón de
// migraciones-seguridad.test.ts de team-portal.

const CARPETA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
const PATRON = /^(\d{2})[a-z]?-[a-z0-9-]+\.sql$/
const NUCLEO_PR4 = ['00-base.sql', '01-seguridad.sql', '02-auditoria.sql', '03-mfa.sql', '04-instalacion-modulos.sql']
const NUCLEO_N2 = ['05-perfiles.sql', '06-avisos.sql', '07-widgets-uso.sql', '08-ia.sql', '09-storage-base.sql']

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
  it('el núcleo 00-09 existe con su nombre', () => {
    const nombres = archivos.map((a) => a.nombre)
    for (const n of [...NUCLEO_PR4, ...NUCLEO_N2]) expect(nombres).toContain(n)
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

  it('00: quita EXECUTE a la función de plataforma rls_auto_enable() solo si es de event trigger, antes de verificar', () => {
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    const revoca = base.indexOf('revoke execute on function public.rls_auto_enable() from public, anon, authenticated')
    expect(revoca).toBeGreaterThan(-1)
    expect(base).toMatch(/prorettype = 'pg_catalog\.event_trigger'::regtype/)
    expect(revoca).toBeLessThan(base.indexOf('funciones security definer ejecutables por anon'))
  })

  it('roles trae funcion con su lista cerrada y un rol por función', () => {
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    expect(base).toMatch(/funcion\s+text\s+constraint\s+roles_funcion_check\s+check\s*\(funcion is null or funcion in \('aviso_leads', 'aviso_perdidas', 'qa'\)\)/i)
    expect(base).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+roles_funcion_unica\s+on\s+public\.roles\s*\(funcion\)\s+where\s+funcion\s+is\s+not\s+null/i)
  })

  it('profiles trae es_servicio y el freno solo deja cambiarlo sin sesión (ni un administrador: saltaría nucleo.miembros)', () => {
    const base = archivos.find((a) => a.nombre === '00-base.sql')!.sql
    expect(base).toMatch(/es_servicio\s+boolean\s+not\s+null\s+default\s+false/i)
    expect(base).toMatch(/new\.es_servicio is distinct from old\.es_servicio\s+and auth\.uid\(\) is not null then\s+new\.es_servicio := old\.es_servicio;/i)
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
    // Una exigir_mfa permisiva no exige nada y abre la tabla: solo cuenta la restrictiva y la otra se reemplaza
    expect(cuerpo.match(/p\.policyname = 'exigir_mfa' and p\.permissive = 'RESTRICTIVE'/g)?.length).toBe(2)
    expect(cuerpo).toMatch(/drop policy if exists exigir_mfa on public\.%I/)
    expect(cuerpo).toMatch(/drop policy if exists exigir_mfa on storage\.objects/)
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
    expect(cuerpo('puede_ver_app')).toMatch(/p_slug = 'nucleo'\s+or \(public\.has_modulo\(p_slug\)\s+and \(public\.is_admin\(\) or public\.has_perm\('app_' \|\| p_slug\) or p_slug = any \(array\[[^\]]*\]\)\)\)/i)
    expect(sql).not.toMatch(/portal_apps/i)
  })

  it('puede_ver_app deja pasar los mismos módulos sin app_<slug> que puedeVerModulo', async () => {
    const { MODULOS } = await import('../modulos')
    const sinApp = MODULOS.filter((m) => m.slug !== 'nucleo' && m.estado === 'disponible' && !m.permisos.some((p) => p.clave === `app_${m.slug}`))
      .map((m) => m.slug)
      .sort()
    const lista = /p_slug = any \(array\[([^\]]*)\]\)/.exec(cuerpo('puede_ver_app'))![1]
    expect([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(sinApp)
  })

  it('limite_modulo acota el número al rango de bigint antes del cast', () => {
    expect(cuerpo('limite_modulo')).toMatch(/greatest\(least\(floor\(\(m\.limites ->> p_clave\)::numeric\), 9223372036854775807\), 0\)::bigint/)
  })

  it('instalacion.zona_horaria solo admite zonas de pg_timezone_names', () => {
    expect(sql).toMatch(/zona_horaria text not null default 'America\/Bogota'\s+constraint instalacion_zona_check check \(public\.zona_horaria_valida\(zona_horaria\)\)/i)
    expect(cuerpo('zona_horaria_valida')).toMatch(/from pg_catalog\.pg_timezone_names z where z\.name = p_zona/)
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.zona_horaria_valida\(text\)\s+to\s+authenticated,\s*service_role/i)
  })

  it('modulos_consumo es solo para un administrador o la service role', () => {
    expect(cuerpo('modulos_consumo')).toMatch(/if not \(public\.is_admin\(\) or coalesce\(auth\.jwt\(\) ->> 'role', ''\) = 'service_role'\) then\s+raise exception[^;]*errcode = '42501'/i)
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
    // es_servicio de app_metadata se marca antes de mirar el límite (también sin límite)
    expect(c).toMatch(/raw_app_meta_data ->> 'es_servicio', ''\) = 'true'\) then\s+update public\.profiles set es_servicio = true where id = new\.id;/)
    expect(c.indexOf("raw_app_meta_data ->> 'es_servicio'")).toBeLessThan(c.indexOf("limite_modulo('nucleo', 'miembros')"))
    expect(c).toMatch(/where not p\.es_servicio/)
    // Al confirmar, el perfil nuevo ya está contado
    expect(c).toMatch(/if v_n > v_limite then\s+raise exception 'limite_miembros/)
    // Diferido: la API Admin de Auth escribe app_metadata después del INSERT, en la misma transacción
    expect(sql).toMatch(/create\s+constraint\s+trigger\s+profiles_limite_miembros\s+after\s+insert\s+on\s+public\.profiles\s+deferrable\s+initially\s+deferred/i)
    expect(sql).toMatch(/tgdeferrable and tginitdeferred/)
    expect(sql).toMatch(/values \('nucleo', true, '\{"miembros": 10\}'\)\s+on conflict \(slug\) do nothing/i)
  })
})

describe('esquema consolidado: 05 a 09', () => {
  const de = (nombre: string) => archivos.find((a) => a.nombre === nombre)!.sql
  const cuerpoEn = (sql: string, nombre: string) =>
    new RegExp(`function\\s+public\\.${nombre}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(sql)![1]
  // Políticas de storage.objects: nombre, comando, roles y expresiones
  const politicasStorage = [...de('09-storage-base.sql').matchAll(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+storage\.objects\s+([^;]*);/gi)]
    .map((m) => ({ nombre: m[1], resto: m[2].replace(/\s+/g, ' ') }))

  it.each(NUCLEO_N2)('%s llama a aplicar_exigir_mfa() antes de verificar', (nombre) => {
    const sql = de(nombre)
    const llamada = sql.search(/select\s+public\.aplicar_exigir_mfa\(\);/i)
    expect(llamada).toBeGreaterThan(-1)
    expect(llamada).toBeLessThan(sql.lastIndexOf('do $$'))
  })

  it('05: columnas de la 90 con sus CHECK y el freno laboral solo deja pasar a admin o manage_members', () => {
    const sql = de('05-perfiles.sql')
    for (const c of ['area', 'extension', 'responsable_id', 'fecha_ingreso', 'bio', 'enlaces']) {
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.profiles\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+${c}\\b`, 'i'))
    }
    expect(sql).toMatch(/check \(public\.enlaces_validos\(enlaces\)\)/)
    expect(cuerpoEn(sql, 'enlaces_validos')).toContain("e.url !~ '^https://[^[:space:]]{1,200}$'")
    expect(/function\s+public\.enlaces_validos\(p_enlaces text\[\]\)\s+returns boolean language sql immutable/i.test(sql)).toBe(true)
    const guard = cuerpoEn(sql, 'guard_profile_laboral')
    expect(guard).toMatch(/if not public\.is_admin\(\) and not public\.has_perm\('manage_members'\) then\s+new\.area := old\.area;\s+new\.responsable_id := old\.responsable_id;\s+new\.fecha_ingreso := old\.fecha_ingreso;/)
    expect(guard).not.toMatch(/new\.bio := old\.bio|new\.enlaces := old\.enlaces/)
  })

  it('05: la política de la 88 sigue en 00-base con is_admin(id) y 05 la comprueba sin redefinirla', () => {
    const base = de('00-base.sql')
    expect(base).toMatch(/policy "gestores actualizan perfiles"[\s\S]*?using \(\(select public\.is_admin\(\)\) or \(\(select public\.has_perm\('manage_members'\)\) and not public\.is_admin\(id\)\)\)\s+with check \(\(select public\.is_admin\(\)\) or \(\(select public\.has_perm\('manage_members'\)\) and not public\.is_admin\(id\)\)\);/)
    const perfiles = de('05-perfiles.sql')
    expect(perfiles).not.toMatch(/create\s+policy/i)
    expect(perfiles).toMatch(/p\.policyname = 'gestores actualizan perfiles'[\s\S]*?p\.qual like '%is_admin\(id\)%' and p\.with_check like '%is_admin\(id\)%'/)
  })

  it('06: user_notifications sin insert para la API, update solo de read y enlace interno', () => {
    const sql = de('06-avisos.sql')
    expect(sql).not.toMatch(/create\s+policy\s+\S+\s+on\s+public\.user_notifications\s+for\s+(?:insert|all)/i)
    expect(sql).toMatch(/grant select, delete on table public\.user_notifications to authenticated;/)
    expect(sql).toMatch(/grant update \(read\) on table public\.user_notifications to authenticated;/)
    expect(sql).not.toMatch(/grant\s+[^;]*insert[^;]*on\s+table\s+public\.user_notifications\s+to\s+authenticated/i)
    expect(sql).toMatch(/constraint user_notifications_link_interno check \(link = '\/' or link ~ '\^\/\[A-Za-z\]'\)/)
    for (const cmd of ['select', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`policy\\s+user_notifications_${cmd}\\s+on\\s+public\\.user_notifications\\s+for\\s+${cmd}\\s+to\\s+authenticated\\s+using\\s+\\(user_id = \\(select auth\\.uid\\(\\)\\)`, 'i'))
    }
  })

  it('06: push_notification no avisa al actor y solo la ejecutan el dueño y los triggers', () => {
    const sql = de('06-avisos.sql')
    expect(cuerpoEn(sql, 'push_notification')).toMatch(/if p_actor is not null and p_user = p_actor then return; end if;/)
    expect(sql).toMatch(/revoke execute on function public\.push_notification\(uuid, uuid, text, text, text, text\) from public, anon, authenticated;/)
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.push_notification/i)
  })

  it('06: cada quien gestiona solo sus suscripciones push', () => {
    const sql = de('06-avisos.sql')
    const politicas = [...sql.matchAll(/create\s+policy\s+(\w+)\s+on\s+public\.push_subscriptions\s+([^;]*);/gi)]
    expect(politicas.map((m) => m[1]).sort()).toEqual(['push_subscriptions_delete', 'push_subscriptions_insert', 'push_subscriptions_select', 'push_subscriptions_update'])
    for (const m of politicas) expect(m[2]).toMatch(/user_id = \(select auth\.uid\(\)\)/)
  })

  it('07: portal_uso solo lo escribe uso_latido, con topes, y solo lo lee un administrador', () => {
    const sql = de('07-widgets-uso.sql')
    const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+public\.portal_uso\s+to\s+(\w+)/gi)].map((m) => [m[1].toLowerCase(), m[2]])
    expect(grants).toEqual([['select', 'authenticated'], ['select, insert, update, delete', 'service_role']])
    expect(sql).toMatch(/policy\s+portal_uso_select\s+on\s+public\.portal_uso\s+for\s+select\s+to\s+authenticated\s+using\s+\(\(select public\.is_admin\(\)\)\)/i)
    const latido = cuerpoEn(sql, 'uso_latido')
    expect(latido).toContain('least(greatest(coalesce(p_minutos, 0), 0), 5)')
    expect(latido).toContain('least(greatest(coalesce(p_aperturas, 0), 0), 20)')
    expect(latido).toContain('least(u.minutos + excluded.minutos, 1440)')
    expect(latido).toMatch(/if not public\.mfa_ok\(\) then/)
    expect(latido).toContain('public.zona_instalacion()')
    expect(sql).not.toMatch(/'America\/Bogota'\)::date|at time zone 'America\/Bogota'/)
    expect(sql).toMatch(/revoke execute on function public\.uso_purgar\(int\) from public, anon, authenticated;\s+grant execute on function public\.uso_purgar\(int\) to service_role;/)
    expect(cuerpoEn(sql, 'uso_purgar')).toMatch(/greatest\(coalesce\(p_dias, [^;]*, 90\), 30\)/)
  })

  it('07: las lecturas de la pestaña Uso son security invoker', () => {
    const sql = de('07-widgets-uso.sql')
    for (const n of ['uso_resumen', 'uso_detalle_usuario', 'acciones_resumen']) {
      const f = funciones(sql).find((x) => x.nombre === n)!
      expect(f.definer, n).toBe(false)
      expect(f.cabecera, n).toMatch(/security\s+invoker/i)
    }
  })

  it('07: la semilla de widgets es la del núcleo en src/lib/modulos.ts y la gestión pide manage_apps', async () => {
    const { MODULOS, NUCLEO } = await import('../modulos')
    const sql = de('07-widgets-uso.sql')
    const semilla = /insert\s+into\s+public\.portal_widgets[^;]*;/i.exec(sql)![0]
    const ids = [...semilla.matchAll(/\('([a-z0-9-]+)',/g)].map((m) => m[1])
    expect(ids).toEqual([...MODULOS.find((m) => m.slug === NUCLEO)!.widgets])
    expect(semilla).toMatch(/on conflict \(id\) do nothing/i)
    expect(sql).toMatch(/policy\s+portal_widgets_gestion\s+on\s+public\.portal_widgets\s+for\s+all\s+to\s+authenticated\s+using\s+\(\(select public\.has_perm\('manage_apps'\)\)\)\s+with\s+check\s+\(\(select public\.has_perm\('manage_apps'\)\)\)/i)
  })

  it('08: ai_usage sin escritura para la API y solo la lee un administrador', () => {
    const sql = de('08-ia.sql')
    const politicas = [...sql.matchAll(/create\s+policy\s+(\w+)\s+on\s+public\.ai_usage\s+([^;]*);/gi)]
    expect(politicas.length).toBe(1)
    expect(politicas[0][2]).toMatch(/^for\s+select\s+to\s+authenticated\s+using\s+\(\(select public\.is_admin\(\)\)\)/i)
    const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+public\.ai_usage\s+to\s+(\w+)/gi)].map((m) => [m[1].toLowerCase(), m[2]])
    expect(grants).toEqual([['select', 'authenticated'], ['all', 'service_role']])
  })

  it('09: ninguna política de storage.objects va a anon ni a public, y ninguna SELECT con bucket_id a secas', () => {
    expect(politicasStorage.length).toBeGreaterThan(0)
    for (const p of politicasStorage) {
      expect(p.resto, p.nombre).toMatch(/\bto authenticated\b/)
      expect(p.resto, p.nombre).not.toMatch(/\bto (?:anon|public)\b|,\s*anon\b/)
      if (/for (?:select|all)\b/.test(p.resto)) {
        expect(p.resto, p.nombre).not.toMatch(/using \(bucket_id = '[^']+'\)/)
        expect(p.resto, p.nombre).toMatch(/using \(bucket_id = '[^']+' and /)
      }
    }
    expect(politicasStorage.some((p) => /bucket_id = 'marca'/.test(p.resto) && /for (?:select|all|update|delete)\b/.test(p.resto))).toBe(false)
  })

  it('09: los avatares solo en la carpeta propia y marca solo para un administrador', () => {
    const avatares = politicasStorage.filter((p) => /bucket_id = 'avatares'/.test(p.resto))
    expect(avatares.map((p) => /for (\w+)/.exec(p.resto)![1]).sort()).toEqual(['delete', 'insert', 'select', 'update'])
    for (const p of avatares) {
      const clausulas = p.resto.match(/\(bucket_id = 'avatares'[^;]*?::text\)/g) ?? []
      expect(clausulas.length, p.nombre).toBe(/for update/.test(p.resto) ? 2 : 1)
      for (const c of clausulas) expect(c).toContain("(storage.foldername(name))[1] = (select auth.uid())::text")
    }
    const marca = politicasStorage.filter((p) => /bucket_id = 'marca'/.test(p.resto))
    expect(marca.length).toBe(1)
    expect(marca[0].resto).toMatch(/^for insert to authenticated with check \(bucket_id = 'marca' and \(select public\.is_admin\(\)\)\)$/)
  })

  it('09: el tope de almacenamiento es una política restrictiva de INSERT con almacenamiento_disponible() (PP-ALM)', () => {
    const sql = de('09-storage-base.sql')
    const tope = politicasStorage.find((p) => p.nombre === 'tope_almacenamiento')!
    expect(tope.resto).toBe('as restrictive for insert to authenticated with check ((select public.almacenamiento_disponible()))')
    const f = funciones(sql).find((x) => x.nombre === 'almacenamiento_disponible')!
    expect(f.definer).toBe(true)
    expect(f.cabecera).toMatch(/stable/i)
    const c = cuerpoEn(sql, 'almacenamiento_disponible')
    expect(c).toMatch(/when public\.limite_modulo\('nucleo', 'almacenamiento_mb'\) is null then true/)
    expect(c).toMatch(/from storage\.objects o/)
    expect(c).toContain("< public.limite_modulo('nucleo', 'almacenamiento_mb')::numeric * 1048576")
    expect(sql).toMatch(/grant execute on function public\.almacenamiento_disponible\(\) to authenticated;/)
  })

  it('09: los buckets son públicos y avatares no admite SVG', () => {
    const insert = /insert\s+into\s+storage\.buckets[^;]*;/i.exec(de('09-storage-base.sql'))![0]
    expect(insert).toMatch(/\('marca', 'marca', true,/)
    expect(insert).toMatch(/\('avatares', 'avatares', true, \d+, array\[[^\]]*\]\)/)
    expect(/\('avatares'[^)]*\]\)/.exec(insert)![0]).not.toContain('svg')
    // Las fuentes de la sección Tema se sirven desde marca
    expect(/\('marca'[^)]*\]\)/.exec(insert)![0]).toMatch(/'font\/woff2', 'font\/woff'/)
  })

  it('el shell sube los avatares al bucket avatares, en la carpeta del miembro', () => {
    const data = readFileSync(fileURLToPath(new URL('../data.ts', import.meta.url)), 'utf8')
    expect(data).toMatch(/export function uploadAvatar\(file: File, userId: string\): Promise<string> \{\s+return uploadSiteImage\(file, userId, 'avatares'\)/)
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

  it('tiene las secciones 0 a 13 y la 0 lee instalador.cuentas_prueba', () => {
    for (let n = 0; n <= 13; n++) expect(sim).toContain(`-- ============ ${n}) `)
    expect(bloques.find((b) => b.startsWith('-- ============ 0) '))).toMatch(/from instalador\.cuentas_prueba where rol = 'qa'/)
  })

  it('cada sección después de la 0 se niega a correr suelta', () => {
    const secciones = bloques.filter((b) => /^-- ============ [1-9]\d*\) /.test(b))
    expect(secciones.length).toBe(13)
    for (const s of secciones) expect(s).toMatch(/current_setting\('rls\.txid', true\) is distinct from txid_current\(\)::text then\s+raise exception/)
  })

  it('la sección 1 borra los claims del miembro antes de crear los roles de prueba como postgres', () => {
    const s1 = bloques.find((b) => b.startsWith('-- ============ 1) '))!
    const alta = s1.indexOf("insert into public.roles (name, permissions, position) values ('prueba-rls-gestor'")
    const ultimoReset = s1.lastIndexOf('reset role;', alta)
    expect(alta).toBeGreaterThan(-1)
    expect(s1.slice(ultimoReset, alta)).toContain("perform set_config('request.jwt.claims', '', true);")
  })

  it('la sección 7 dispara el trigger diferido en cada caso y sigue el orden de la API Admin de Auth', () => {
    const s7 = bloques.find((b) => b.startsWith('-- ============ 7) '))!
    expect(s7.match(/set constraints public\.profiles_limite_miembros immediate;/g)?.length).toBe(5)
    expect(s7.match(/set constraints public\.profiles_limite_miembros deferred;/g)?.length).toBe(5)
    expect(s7).toMatch(/update auth\.users set raw_app_meta_data = raw_app_meta_data \|\| '\{"es_servicio": true\}'/)
  })

  it('las secciones 8 a 11 salen OMITIDO si falta su archivo de 05 a 09', () => {
    const omite: [number, string][] = [[8, '05-perfiles.sql'], [9, '06-avisos.sql'], [10, '08-ia.sql'], [11, '09-storage-base.sql']]
    for (const [n, archivo] of omite) {
      const s = bloques.find((b) => b.startsWith(`-- ============ ${n}) `))!
      expect(s, String(n)).toContain(`OMITIDO ${n}`)
      expect(s, String(n)).toContain(archivo)
    }
  })

  it('la sección 11 prueba el tope con almacenamiento_mb = 0 y vuelve a null', () => {
    const s11 = bloques.find((b) => b.startsWith('-- ============ 11) '))!
    expect(s11).toContain(`'{"almacenamiento_mb": 0}'`)
    expect(s11.indexOf(`'{"almacenamiento_mb": 0}'`)).toBeLessThan(s11.lastIndexOf(`'{"almacenamiento_mb": null}'`))
  })

  it('no lleva marca, correos ni emojis de una instalación', () => {
    expect(sim).not.toMatch(/luce/i)
    expect(sim).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/)
    expect(sim).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('esquema: 21-crm', () => {
  const a = archivos.find((x) => x.nombre === '21-crm.sql')!
  const sql = a.sql
  const cuerpo = (nombre: string) => new RegExp(`function\\s+public\\.${nombre}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(sql)![1]

  it('cada tabla del registro crm lleva aplicar_politica_modulo y se crea en el archivo', async () => {
    const { tablasDe } = await import('../modulos')
    const lista = tablasDe('crm')
    expect(lista.length).toBe(9)
    for (const t of lista) {
      expect(tablas(sql), t).toContain(t)
      expect(sql, t).toMatch(new RegExp(`select\\s+public\\.aplicar_politica_modulo\\('public\\.${t}',\\s*array\\['crm'\\]\\);`, 'i'))
    }
    expect(sql.search(/select\s+public\.aplicar_exigir_mfa\(\);/i)).toBeLessThan(sql.lastIndexOf('do $$'))
  })

  it('ninguna política abre con true', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(sql).not.toMatch(/with\s+check\s*\(\s*true\s*\)/i)
  })

  it('las políticas de delete exigen is_admin', () => {
    const del = [...sql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.(crm_\w+)\s+for\s+delete\s+([^;]*);/gi)]
    expect(del.length).toBeGreaterThan(3)
    for (const m of del) expect(m[2], m[1]).toMatch(/\(select public\.is_admin\(\)\)/)
  })

  it('crm_salud no tiene grant ni política para authenticated', () => {
    for (const m of sql.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+([^;]+?)\s+to\s+([^;]+);/gi)) {
      if (/public\.crm_salud\b/.test(m[2])) expect(m[3]).not.toMatch(/authenticated|anon/)
    }
    expect(sql).not.toMatch(/create\s+policy\s+\w+\s+on\s+public\.crm_salud\b/i)
  })

  it.each(['crm_salud_leer', 'crm_salud_guardar', 'crm_salud_borrar'])('%s: definer, search_path, revoke, aal2 y registro del acceso', (n) => {
    const f = funciones(sql).find((x) => x.nombre === n)!
    expect(f.definer).toBe(true)
    expect(f.cabecera).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i)
    expect(revocaA(sql, n, 'public,\\s*anon')).toBe(true)
    expect(sql).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${n}\\s*\\([^;]*\\)\\s+to\\s+authenticated;`, 'i'))
    const c = cuerpo(n)
    expect(c).toMatch(/coalesce\(\(select auth\.jwt\(\) ->> 'aal'\), ''\) <> 'aal2' then\s+raise exception[^;]*errcode = '42501', hint = 'salud_mfa'/)
    expect(c).toMatch(/insert into public\.crm_accesos_salud/)
    // Permiso explícito: has_perm daría true a un administrador por serlo
    expect(c).toMatch(/public\.crm_perm_explicito\('(?:ver|edit)_salud'\)/)
    expect(c).not.toMatch(/has_perm\('(?:ver|edit)_salud'\)/)
  })

  it('crm_perm_explicito no tiene el atajo de admin y guardar exige consentimiento', () => {
    expect(cuerpo('crm_perm_explicito')).not.toMatch(/'admin'/)
    expect(cuerpo('crm_salud_guardar')).toMatch(/hint = 'salud_sin_consentimiento'/)
    expect(cuerpo('crm_salud_borrar')).toMatch(/public\.is_admin\(\) and public\.crm_perm_explicito\('edit_salud'\)/)
  })

  it('crm_buscar es security invoker y no toca salud', () => {
    const f = funciones(sql).find((x) => x.nombre === 'crm_buscar')!
    expect(f.definer).toBe(false)
    expect(f.cabecera).toMatch(/security\s+invoker/i)
    const c = cuerpo('crm_buscar')
    expect(c).not.toMatch(/salud/i)
    expect(c).toContain(String.raw`replace(replace(replace(nullif(btrim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_')`)
    expect(c).toContain('least(greatest(coalesce(p_limite, 50), 1), 200)')
  })

  it('salud no entra al historial ni a la auditoría; los consentimientos sí se auditan', () => {
    expect(sql).not.toMatch(/create\s+trigger\s+\w+[^;]*on\s+public\.crm_(?:salud|accesos_salud)\b[^;]*(?:auditar_cambio|crm_registrar_cambio)/i)
    expect(sql).not.toMatch(/create\s+trigger\s+\w+[^;]*on\s+public\.crm_consentimientos\b[^;]*crm_registrar_cambio/i)
    expect(sql).toMatch(/create\s+trigger\s+auditar_cambio\s+after\s+insert\s+or\s+update\s+on\s+public\.crm_consentimientos\b/i)
    expect(cuerpo('crm_registrar_cambio')).not.toMatch(/salud/i)
  })

  it('la verificación no pasa delete a has_any_column_privilege', () => {
    for (const m of sql.matchAll(/foreach\s+t\s+in\s+array\s+array\[([^\]]*)\]\s+loop([\s\S]*?)end\s+loop;/gi)) {
      if (/has_any_column_privilege/.test(m[2])) expect(m[1]).not.toMatch(/'delete'|'truncate'|'trigger'/)
    }
    for (const m of sql.matchAll(/has_any_column_privilege\([^)]*\)/gi)) expect(m[0]).not.toMatch(/'delete'|'truncate'|'trigger'/)
  })

  it('salud y consentimientos: on delete restrict y error claro al borrar la cuenta', () => {
    for (const t of ['crm_salud', 'crm_consentimientos']) {
      const def = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${t}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)![1]
      expect(def, t).toMatch(/references public\.crm_cuentas \(id\) on delete restrict/)
      expect(def, t).not.toMatch(/on delete cascade/)
      expect(sql, t).toMatch(new RegExp(`alter table public\\.${t} add constraint ${t}_cuenta_id_fkey\\s+foreign key \\(cuenta_id\\) references public\\.crm_cuentas \\(id\\) on delete restrict;`))
    }
    const c = cuerpo('crm_cuenta_borrable')
    expect(c).toMatch(/hint = 'crm_cuenta_con_salud'/)
    expect(c).toMatch(/hint = 'crm_cuenta_con_consentimientos'/)
    expect(sql).toMatch(/create trigger crm_cuenta_borrable before delete on public\.crm_cuentas/)
  })

  it('Vault: create_secret por nombre, sin firma exacta', () => {
    expect(sql).not.toMatch(/to_regprocedure\('vault\.create_secret/i)
    expect(sql).toMatch(/n\.nspname = 'vault' and p\.proname = 'create_secret'/)
  })

  it('sin clave y con filas en crm_salud aborta en vez de crear otra clave', () => {
    const bloque = /do \$\$\s*begin\s*if not exists \(select 1 from vault\.secrets where name = 'crm_salud_clave'\) then([\s\S]*?)end \$\$;/.exec(sql)![1]
    const aborta = bloque.search(/if exists \(select 1 from public\.crm_salud\) then\s+raise exception/)
    expect(aborta).toBeGreaterThan(-1)
    expect(aborta).toBeLessThan(bloque.indexOf('vault.create_secret'))
    expect(sql).toMatch(/pgp_sym_decrypt\(s\.datos_cifrados, public\.crm_salud_clave\(\)\)\)\s+from public\.crm_salud s limit 1/)
  })

  it('consentimientos: sin delete por la API, vigente por created_at, fecha no futura', () => {
    expect(sql).not.toMatch(/create\s+policy\s+\w+\s+on\s+public\.crm_consentimientos\s+for\s+delete/i)
    for (const m of sql.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+([^;]+?)\s+to\s+([^;]+);/gi)) {
      if (/public\.crm_consentimientos\b/.test(m[2])) expect(m[1], m[0]).not.toMatch(/delete|\ball\b/i)
    }
    expect(cuerpo('crm_salud_guardar')).toMatch(/order by k\.created_at desc, k\.id desc/)
    expect(cuerpo('crm_salud_guardar')).not.toMatch(/order by k\.fecha/)
    const prep = cuerpo('crm_consentimientos_preparar')
    expect(prep).toMatch(/new\.fecha > current_date \+ 1/)
    expect(prep).toMatch(/new\.created_at := now\(\)/)
    expect(prep).toMatch(/new\.revocado_por := auth\.uid\(\)/)
  })

  it('bucket: carpeta de una cuenta persona y archivo_ruta en la carpeta de su cuenta', () => {
    for (const n of ['crm_consentimientos_leer', 'crm_consentimientos_subir']) {
      const m = new RegExp(`create policy ${n} on storage\\.objects([^;]*);`).exec(sql)![1]
      expect(m, n).toMatch(/c\.id::text = \(storage\.foldername\(name\)\)\[1\] and c\.tipo = 'persona'/)
    }
    expect(sql).toMatch(/create policy crm_consentimientos_leer on storage\.objects[^;]*\(\(select public\.has_perm\('edit_crm'\)\) or \(select public\.crm_perm_explicito\('ver_salud'\)\)\)/)
    expect(/create policy crm_consentimientos_subir on storage\.objects([^;]*);/.exec(sql)![1]).not.toMatch(/ver_salud/)
    expect(/create policy crm_consentimientos_update on public\.crm_consentimientos([^;]*);/.exec(sql)![1]).toMatch(/has_perm\('edit_crm'\)/)
    expect(sql).toMatch(/create policy crm_consentimientos_borrar on storage\.objects\s+for delete to authenticated\s+using \([^;]*public\.is_admin\(\)/)
    expect(sql).toMatch(/check \(archivo_ruta is null or left\(archivo_ruta, 37\) = cuenta_id::text \|\| '\/'\)/)
  })

  it('un contacto que cambia de cuenta se lleva sus actividades', () => {
    expect(sql).toMatch(/create trigger crm_mover_actividades after update of cuenta_id on public\.crm_contactos/)
    expect(cuerpo('crm_contacto_mover_actividades')).toMatch(/update public\.crm_actividades a set cuenta_id = new\.cuenta_id\s+where a\.contacto_id = new\.id/)
    expect(funciones(sql).find((x) => x.nombre === 'crm_contacto_mover_actividades')!.definer).toBe(true)
  })
})

describe('exigir_mfa restrictiva en las comprobaciones', () => {
  it('verificar.sql y seguridad_resumen() solo dan por buena una exigir_mfa restrictiva', () => {
    const verificar = readFileSync(CARPETA + 'verificar.sql', 'utf8')
    const sinMfa = /sin_mfa as \(([\s\S]*?)\n\),/.exec(verificar)![1]
    expect(sinMfa).toMatch(/p\.policyname = 'exigir_mfa'\s+and p\.permissive = 'RESTRICTIVE'/)
    const auditoria = archivos.find((a) => a.nombre === '02-auditoria.sql')!.sql
    const resumen = /function\s+public\.seguridad_resumen\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(auditoria)![1]
    expect(resumen.match(/policyname = 'exigir_mfa'\s+and pp\.permissive = 'RESTRICTIVE'/g)?.length).toBe(2)
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
