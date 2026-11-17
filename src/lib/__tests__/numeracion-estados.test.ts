import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MODULOS, NUCLEO } from '../modulos'
import { PERMISSIONS } from '../../types'

// Numeración de documentos (PP-DEC-25, BL-05a) y máquina de estados
// (PP-DEC-26, BL-06), leídas como texto: no hace falta una base. El SQL está
// en supabase/esquema/09b-numeracion.sql y 09c-estados.sql; la convención,
// en docs/esquema.md. Las reglas generales (bloque 0, verificación, RLS,
// search_path, grants) las revisa esquema.test.ts para todo archivo.

const CARPETA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
const PATRON = /^(\d{2})[a-z]?-[a-z0-9-]+\.sql$/
const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n?/g, '\n')
const nombres = readdirSync(CARPETA).filter((n) => PATRON.test(n)).sort()
const numeracion = sinComentarios(leer(CARPETA + '09b-numeracion.sql'))
const estados = sinComentarios(leer(CARPETA + '09c-estados.sql'))

// Cuerpo ($$ … $$) y cabecera (hasta «as $$») de una función de public
function funcion(sql: string, nombre: string) {
  const m = new RegExp(`create or replace function public\\.${nombre}\\(([\\s\\S]*?)\\)\\s*\\n?returns([\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql)
  if (!m) throw new Error(`falta la función ${nombre}`)
  return { argumentos: m[1], cabecera: m[2], cuerpo: m[3] }
}

// Parte del archivo antes de la verificación final (que crea objetos de prueba)
const antesDeVerificar = (sql: string) => sql.slice(0, sql.lastIndexOf('do $$'))

describe('09b-numeracion.sql (PP-DEC-25)', () => {
  it('es del núcleo y va justo después de 09-storage-base, antes que 09c-estados', () => {
    expect(nombres.indexOf('09b-numeracion.sql')).toBe(nombres.indexOf('09-storage-base.sql') + 1)
    expect(nombres.indexOf('09c-estados.sql')).toBe(nombres.indexOf('09b-numeracion.sql') + 1)
    expect(numeracion).toMatch(/to_regprocedure\('public\.has_perm\(text\)'\) is null then\s+raise exception '09b-numeracion detenido: falta 00-base\.sql'/)
  })

  it('series: dos modos, reinicio cerrado y vigencia ordenada', () => {
    expect(numeracion).toMatch(/modo text not null constraint series_modo_check check \(modo in \('con_huecos', 'sin_huecos'\)\)/)
    expect(numeracion).toMatch(/constraint series_reinicio_check check \(reinicio in \('nunca', 'anual', 'mensual'\)\)/)
    expect(numeracion).toMatch(/constraint series_vigencia_check check \(vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta\)/)
    // La clave forma el nombre de la secuencia: identificador corto y seguro
    expect(numeracion).toMatch(/clave text primary key constraint series_clave_check check \(clave ~ '\^\[a-z\]\[a-z0-9_\]\{0,39\}\$'\)/)
  })

  it('la API no escribe el contador: grants por columna sin actual, periodo ni modo en el update, y sin delete', () => {
    const sql = antesDeVerificar(numeracion)
    expect(sql).toMatch(/revoke all on table public\.series from anon, authenticated, service_role;/)
    const insert = /grant insert \(([^)]*)\) on table public\.series to authenticated;/.exec(sql)![1].split(/,\s*/)
    const update = /grant update \(([^)]*)\) on table public\.series to authenticated;/.exec(sql)![1].split(/,\s*/)
    expect(insert).not.toContain('actual')
    expect(insert).not.toContain('periodo')
    expect(update).toEqual(['prefijo', 'relleno', 'tope', 'vigente_desde', 'vigente_hasta'])
    expect(sql).not.toMatch(/grant\s+(?:all|[^;]*\bdelete\b)[^;]*on table public\.series/i)
    expect(sql).not.toMatch(/grant\s+(?:insert|update)\s+on table public\.series/i)
    expect(sql).not.toMatch(/create policy \w+ on public\.series\s+for (?:delete|all)/)
  })

  it('ver, crear y editar series exige gestionar_series', () => {
    for (const p of ['series_select', 'series_insert', 'series_update']) {
      const politica = new RegExp(`create policy ${p} on public\\.series[^;]*;`).exec(numeracion)![0]
      expect(politica, p).toContain("public.has_perm('gestionar_series')")
      expect(politica, p).toMatch(/to authenticated/)
    }
  })

  it('series_siguiente: security definer con lock_timeout, solo para la service role', () => {
    const f = funcion(numeracion, 'series_siguiente')
    expect(f.cabecera).toMatch(/security definer set search_path = public, pg_temp set lock_timeout = '2s'/)
    expect(numeracion).toMatch(/revoke execute on function public\.series_siguiente\(text, date\) from public, anon, authenticated;/)
    expect([...numeracion.matchAll(/grant execute on function public\.series_siguiente\(([^)]*)\) to (\w+)/g)].map((m) => m[2])).toEqual(['service_role'])
  })

  it('sin huecos: rechaza la llamada suelta por la API, bloquea la fila y avisa si está ocupada', () => {
    const c = funcion(numeracion, 'series_siguiente').cuerpo
    const suelta = c.indexOf("current_setting('request.path', true) = '/rpc/series_siguiente'")
    const bloqueo = c.indexOf('select * into s from public.series where clave = p_clave for update;')
    expect(suelta).toBeGreaterThan(c.indexOf("if s.modo = 'sin_huecos' then"))
    expect(bloqueo).toBeGreaterThan(suelta)
    expect(c).toMatch(/exception when lock_not_available then\s+raise exception [\s\S]*?errcode = '55P03', hint = 'series_ocupada'/)
    // El contador sube en la misma transacción: si el documento se deshace, el número también
    expect(c).toMatch(/update public\.series set actual = v_n, periodo = v_periodo where clave = p_clave;/)
  })

  it('con huecos: secuencia propia sin bloqueo largo; el reinicio de periodo solo avanza', () => {
    const c = funcion(numeracion, 'series_siguiente').cuerpo
    const conHuecos = c.slice(c.lastIndexOf('else'))
    expect(conHuecos).toMatch(/v_n := nextval\(v_secuencia\);/)
    expect(conHuecos).not.toMatch(/for update/)
    expect(conHuecos).toMatch(/where clave = p_clave and \(periodo is null or periodo < v_periodo\);\s+if found then\s+perform setval\(v_secuencia, 1, false\);/)
  })

  it('falla cerrado: vigencia, periodo anterior y tope en los dos modos, antes de devolver', () => {
    const c = funcion(numeracion, 'series_siguiente').cuerpo
    expect(c).toMatch(/hint = 'series_fuera_de_vigencia'/)
    expect(c).toMatch(/if v_periodo < s\.periodo then\s+raise exception[^;]*hint = 'series_periodo'/)
    expect(c.match(/if s\.tope is not null and v_n > s\.tope then\s+raise exception[^;]*errcode = '54000', hint = 'series_agotada'/g)?.length).toBe(2)
    expect(c.indexOf('series_fuera_de_vigencia')).toBeLessThan(c.indexOf('v_n :='))
  })

  it('el número lleva el periodo cuando la serie se reinicia y no corta el valor al rellenar', () => {
    const c = funcion(numeracion, 'series_siguiente').cuerpo
    expect(c).toMatch(/return s\.prefijo \|\| coalesce\(v_periodo \|\| '-', ''\) \|\| lpad\(v_n::text, greatest\(s\.relleno, char_length\(v_n::text\)\), '0'\);/)
    expect(c).toMatch(/when 'anual' then to_char\(v_fecha, 'YYYY'\)\s+when 'mensual' then to_char\(v_fecha, 'YYYY-MM'\)/)
  })

  it('la secuencia de una serie con huecos queda sin grants y se nombra con %I', () => {
    const c = funcion(numeracion, 'series_crear_secuencia').cuerpo
    expect(c).toMatch(/format\('create sequence if not exists public\.%I as bigint minvalue 1', 'serie_' \|\| new\.clave\)/)
    expect(c).toMatch(/format\('revoke all on sequence public\.%I from public, anon, authenticated, service_role', 'serie_' \|\| new\.clave\)/)
    expect(numeracion).toMatch(/create trigger series_crear_secuencia\s+after insert on public\.series/)
  })

  it('la verificación prueba el hueco deshecho, el tope, la vigencia y el periodo, y borra lo de prueba', () => {
    const v = numeracion.slice(numeracion.lastIndexOf('do $$'))
    for (const t of ["<> 'F-0001'", "<> 'F-0002'", "sqlstate '54000'", "sqlstate '22023'", "'lock_timeout=2s' = any (p.proconfig)"]) expect(v, t).toContain(t)
    expect(v).toMatch(/delete from public\.series where clave in \('prueba_09b_sin', 'prueba_09b_con'\);\s+drop sequence public\.serie_prueba_09b_con;/)
  })
})

describe('09c-estados.sql (PP-DEC-26)', () => {
  it('categorías fijas, un solo estado inicial y transiciones entre estados de la misma entidad', () => {
    expect(estados).toMatch(/check \(categoria in \('borrador', 'en_curso', 'aprobado', 'hecho', 'anulado'\)\)/)
    expect(estados).toMatch(/create unique index if not exists estados_inicial_unico on public\.estados \(entidad\) where inicial;/)
    expect(estados).toMatch(/foreign key \(entidad, desde\) references public\.estados \(entidad, clave\)/)
    expect(estados).toMatch(/foreign key \(entidad, hacia\) references public\.estados \(entidad, clave\)/)
    expect(estados).toMatch(/permiso text not null/)
  })

  it('el catálogo es de solo lectura para la API', () => {
    const sql = antesDeVerificar(estados)
    expect(sql).toMatch(/revoke all on table public\.estados_entidades, public\.estados, public\.estados_transiciones from anon, authenticated, service_role;/)
    const grants = [...sql.matchAll(/grant ([^;]+?) on table ([^;]+?) to ([^;]+);/g)]
    expect(grants.map((g) => g[1])).toEqual(['select'])
    expect(sql).not.toMatch(/create policy \w+ on public\.estados\w*\s+for (?:insert|update|delete|all)/)
  })

  it('aplicar_transicion: invoker, catálogo y permiso antes del update optimista, una fila exacta y auditoría', () => {
    const f = funcion(estados, 'aplicar_transicion')
    expect(f.cabecera).toMatch(/security invoker set search_path = public, pg_temp/)
    expect(f.cabecera).not.toMatch(/security definer/)
    const c = f.cuerpo
    const catalogo = c.search(/from public\.estados_transiciones t\s+where t\.entidad = p_entidad and t\.desde = p_desde and t\.hacia = p_hacia;/)
    const noPermitida = c.search(/raise exception[^;]*errcode = '22023', hint = 'estados_transicion'/)
    const permiso = c.search(/if not public\.has_perm\(v_permiso\) then\s+raise exception[^;]*errcode = '42501', hint = 'estados_permiso'/)
    const marca = c.indexOf("perform set_config('estados.transicion', p_entidad || ':' || p_id || ':' || p_hacia, true);")
    const update = c.indexOf("execute format('update %I.%I set estado = $1 where id = $2 and estado = $3', v_esquema, v_nombre)")
    const conflicto = c.search(/if v_n <> 1 then\s+raise exception[\s\S]*?errcode = '40001', hint = 'estados_conflicto'/)
    const auditoria = c.indexOf("insert into public.audit_log (user_id, action, detail, entity, entity_id, origen)")
    for (const [n, p] of Object.entries({ catalogo, noPermitida, permiso, marca, update, conflicto, auditoria })) expect(p, n).toBeGreaterThan(-1)
    expect(catalogo).toBeLessThan(noPermitida)
    expect(noPermitida).toBeLessThan(permiso)
    expect(permiso).toBeLessThan(marca)
    expect(marca).toBeLessThan(update)
    expect(update).toBeLessThan(conflicto)
    expect(conflicto).toBeLessThan(auditoria)
    expect(c).toMatch(/using p_hacia, p_id, p_desde;\s+get diagnostics v_n = row_count;\s+perform set_config\('estados\.transicion', '', true\);/)
    expect(c).toMatch(/values \(auth\.uid\(\), 'estados\.transicion', p_desde \|\| ' → ' \|\| p_hacia, p_entidad, p_id::text, 'cliente'\)/)
    // La tabla sale de la lista cerrada estados_entidades, no del argumento
    expect(c).toMatch(/from public\.estados_entidades e\s+join pg_catalog\.pg_class k on k\.oid = e\.tabla/)
    expect(estados).toMatch(/revoke execute on function public\.aplicar_transicion\(text, uuid, text, text\) from public, anon;/)
    expect(estados).toMatch(/grant execute on function public\.aplicar_transicion\(text, uuid, text, text\) to authenticated;/)
  })

  it('el SQL dinámico solo usa format con %I (sin %s ni texto concatenado en execute)', () => {
    for (const [nombre, sql] of [['09b', numeracion], ['09c', estados]] as const) {
      const ejecuciones = [...sql.matchAll(/\bexecute\s+(?!function\b|on\b)([^;]+);/gi)].map((m) => m[1])
      expect(ejecuciones.length, nombre).toBeGreaterThan(0)
      for (const e of ejecuciones) {
        expect(e, nombre).toMatch(/^format\('/)
        expect(e, nombre).not.toMatch(/%s|%L/)
      }
    }
  })

  it('estados_guardia: alta en el estado inicial y cambio solo con la marca de aplicar_transicion, sin excepción para el administrador', () => {
    const c = funcion(estados, 'estados_guardia').cuerpo
    expect(c).toMatch(/if tg_op = 'INSERT' then\s+if not exists \(select 1 from public\.estados s where s\.entidad = v_entidad and s\.clave = new\.estado and s\.inicial\) then\s+raise exception[^;]*errcode = '23514', hint = 'estados_inicial'/)
    expect(c).toMatch(/new\.estado is distinct from old\.estado\s+and \(v_entidad is null\s+or current_setting\('estados\.transicion', true\) is distinct from v_entidad \|\| ':' \|\| new\.id \|\| ':' \|\| new\.estado\) then\s+raise exception[^;]*errcode = '42501', hint = 'estados_directo'/)
    // D-9: ni administrador ni sesión vacía pasan por fuera
    expect(c).not.toMatch(/is_admin|has_perm|auth\.uid\(\)/)
    expect(funcion(estados, 'aplicar_transicion').cuerpo).not.toMatch(/is_admin/)
  })

  it('estados_registrar: solo el dueño; exige id uuid y estado text y pone estados_guardia antes del sello', () => {
    const c = funcion(estados, 'estados_registrar').cuerpo
    expect(estados).toMatch(/revoke execute on function public\.estados_registrar\(text, regclass\) from public, anon, authenticated, service_role;/)
    expect(c).toMatch(/a\.attname = 'id' and a\.atttypid = 'uuid'::regtype/)
    expect(c).toMatch(/a\.attname = 'estado' and a\.atttypid = 'text'::regtype/)
    expect(c).toMatch(/format\('create trigger %I before insert or update of estado on %I\.%I for each row execute function public\.estados_guardia\(\)',\s+'estados_guardia', v_esquema, v_nombre\)/)
    expect('estados_guardia' < 'zz_contrato_sellar').toBe(true)
  })

  it('la verificación prueba la guarda en una tabla temporal y la borra', () => {
    const v = estados.slice(estados.lastIndexOf('do $$'))
    expect(v).toContain('create temp table estados_prueba')
    for (const t of ["sqlstate '23514'", "sqlstate '42501'", "v := 'directo'", "v := 'permiso'"]) expect(v, t).toContain(t)
    expect(v).toMatch(/delete from public\.estados_entidades where entidad = 'prueba_09c';\s+drop table estados_prueba;/)
  })
})

describe('permiso gestionar_series', () => {
  it('es del núcleo y está en el catálogo de la matriz de roles', () => {
    expect(MODULOS.find((m) => m.slug === NUCLEO)!.permisos.map((p) => p.clave)).toContain('gestionar_series')
    expect(PERMISSIONS.map((p) => p.key)).toContain('gestionar_series')
  })
})

describe('comprobaciones fuera de las pruebas estáticas (17 y 18)', () => {
  const verificar = leer(CARPETA + 'verificar.sql')
  const sim = leer(fileURLToPath(new URL('../../../supabase/pruebas/rls-simulacion.sql', import.meta.url)))
  const seccion = (n: number) => sim.split(/\n(?=-- ============ )/).find((b) => b.startsWith(`-- ============ ${n}) `))!

  it('verificar.sql: las tablas nuevas cuentan como núcleo y la 17 y la 18 existen', () => {
    expect(verificar).toMatch(/'ai_usage', 'series', 'estados_entidades', 'estados',\s+'estados_transiciones'\]\) as relname/)
    expect(verificar).toContain("'numeración: contador sin escritura para la API y series_siguiente solo del servidor'")
    expect(verificar).toContain("'máquina de estados: catálogo de solo lectura, aplicar_transicion sin security definer y guardas activas'")
    expect(verificar).toMatch(/g\.table_name = 'series' and g\.column_name in \('actual', 'periodo'\)/)
    expect(verificar).toMatch(/c\.relkind = 'S' and c\.relname like 'serie\\_%'/)
    expect(verificar).toMatch(/g\.tgname = 'estados_guardia' and not g\.tgisinternal and g\.tgenabled = 'D'/)
    expect(verificar).toContain("'falta 09b-numeracion.sql (npm run instalar)'")
    expect(verificar).toContain("'falta 09c-estados.sql (npm run instalar)'")
  })

  it('la sección 17 prueba los dos modos, la llamada suelta, el miembro y el administrador', () => {
    const s = seccion(17)
    expect(s).toContain('OMITIDO 17    numeración · falta 09b-numeracion.sql')
    for (const caso of ['17.1', '17.2', '17.3', '17.4', '17.5', '17.6']) expect(s, caso).toContain(`'${caso}  `)
    expect(s).toContain("v = 'F-0001 / F-0002'")
    expect(s).toContain("v = 'C-001 / C-003'")
    expect(s).toContain("set_config('request.path', '/rpc/series_siguiente', true)")
    expect(s).toContain("update public.series set actual = 99 where clave = 'prueba_rls_admin'")
  })

  it('la sección 18 crea una tabla temporal y prueba válida, no permitida, sin permiso, conflicto, directa y administrador', () => {
    const s = seccion(18)
    expect(s).toContain('OMITIDO 18    máquina de estados · falta 09c-estados.sql')
    expect(s).toContain('create temp table prueba_rls_estados')
    expect(s).toContain("perform public.estados_registrar('prueba_rls', 'prueba_rls_estados'::regclass);")
    for (const caso of ['18.1', '18.2', '18.3', '18.4', '18.5', '18.6', '18.7']) expect(s, caso).toContain(`'${caso}  `)
    for (const esperado of ["v = '23514 / entró'", "v = '22023'", "v = '42501'", "v = '40001'", "v = '22023 / 42501'"]) expect(s, esperado).toContain(esperado)
    expect(s).toMatch(/action = 'estados\.transicion' and entity = 'prueba_rls'/)
  })
})
