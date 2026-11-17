import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MODULOS, NUCLEO } from '../modulos'

// Contrato base de tabla (PP-DEC-23, BL-02) y moneda como par (PP-DEC-24,
// BL-08), leídos como texto: no hace falta una base. Las funciones están en
// supabase/esquema/00b-contrato-tabla.sql y la convención en docs/esquema.md.
//
// Toda tabla que declara un módulo con archivo de esquema (Modulo.tablas)
// lleva el contrato: un archivo del módulo (el de Modulo.sql o una
// corrección con su número) llama a contrato_aplicar('public.<tabla>').
// Exentas, con el motivo: tablas que no son registros de negocio editables.

const CARPETA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
const PATRON = /^(\d{2})[a-z]?-[a-z0-9-]+\.sql$/

const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
const archivos = readdirSync(CARPETA)
  .filter((n) => PATRON.test(n))
  .sort()
  .map((nombre) => ({ nombre, sql: sinComentarios(readFileSync(CARPETA + nombre, 'utf8').replace(/\r\n?/g, '\n')) }))
const de = (nombre: string) => archivos.find((a) => a.nombre === nombre)!.sql

// Historial, registros de acceso, configuración y datos que solo escriben
// funciones propias: no son registros que un miembro cree y edite
const EXENTAS: Record<string, string> = {
  crm_campos_def: 'configuración: la define un administrador, cada cambio queda en audit_log y no se archiva',
  crm_cambios: 'historial inmutable: solo lo escribe crm_registrar_cambio, con autor_id y created_at propios',
  crm_vinculos_externos: 'sincronización con un sistema externo: solo la escribe la service role y su sello es sincronizado_en',
  crm_salud: 'datos cifrados: solo los escribe crm_salud_guardar, que sella actualizado_por y updated_at; se borran, no se archivan',
  crm_consentimientos: 'prueba legal inmutable: crm_consentimientos_preparar sella registrado_por y created_at y solo admite revocar',
  crm_accesos_salud: 'registro de accesos inmutable: lo escriben las funciones de salud',
}

// Columnas del contrato que una tabla omite (contrato_aplicar(tabla, sin))
const PARCIALES: Record<string, Record<string, string>> = {
  crm_actividades: {
    created_by: 'la autoría es autor_id, que sella crm_preparar desde 21-crm.sql; la usan la pantalla y la política de borrado del autor',
    archivado_en: 'una actividad es un hecho con fecha: la borra su autor o un administrador, no se archiva',
  },
}

const COLUMNAS = ['created_by', 'updated_by', 'created_at', 'updated_at', 'creado_via', 'archivado_en']

// Módulos con archivo de esquema y los archivos de cada uno (el suyo y las
// correcciones con letra de su número, como archivosDeModulo de modulos.mjs)
const conEsquema = MODULOS.filter((m) => m.slug !== NUCLEO && m.sql && archivos.some((a) => a.nombre === m.sql)).map((m) => ({
  modulo: m,
  sql: archivos.filter((a) => a.nombre.slice(0, 2) === m.sql!.slice(0, 2)).map((a) => a.sql).join('\n'),
}))

// Tablas que crea un archivo (create table, no las temporales)
const tablasCreadas = (sql: string) =>
  [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi)].map((m) => m[1].toLowerCase())

// Llamadas a contrato_aplicar: tabla → columnas omitidas
function aplicaciones(sql: string): Map<string, string[]> {
  const salida = new Map<string, string[]>()
  const re = /public\.contrato_aplicar\(\s*'public\.(\w+)'\s*(?:,\s*array\[([^\]]*)\])?\s*\)/gi
  for (const m of sql.matchAll(re)) {
    salida.set(m[1], m[2] ? [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort() : [])
  }
  return salida
}

describe('contrato base de tabla (PP-DEC-23)', () => {
  it('hay al menos un módulo con esquema que revisar', () => {
    expect(conEsquema.map((c) => c.modulo.slug)).toContain('crm')
  })

  it.each(conEsquema.map((c) => [c.modulo.slug, c] as const))('%s: toda tabla de negocio aplica el contrato o está exenta con motivo', (_s, c) => {
    const aplicadas = aplicaciones(c.sql)
    const fallos: string[] = []
    for (const t of c.modulo.tablas) {
      if (EXENTAS[t]) {
        if (aplicadas.has(t)) fallos.push(`${t}: exenta pero aplica el contrato`)
        continue
      }
      const sin = aplicadas.get(t)
      if (!sin) fallos.push(`${t}: sin contrato_aplicar`)
      else if (sin.join(',') !== Object.keys(PARCIALES[t] ?? {}).sort().join(',')) fallos.push(`${t}: omite [${sin}] sin motivo en PARCIALES`)
    }
    // Una tabla que el módulo crea sin declararla en Modulo.tablas se
    // saltaría la revisión de arriba
    for (const t of tablasCreadas(c.sql)) if (!c.modulo.tablas.includes(t)) fallos.push(`${t}: creada sin figurar en Modulo.tablas`)
    expect(fallos).toEqual([])
  })

  it('las exentas y las parciales nombran tablas de un módulo y llevan motivo', () => {
    const deModulos = new Set(MODULOS.flatMap((m) => m.tablas))
    for (const [t, motivo] of Object.entries(EXENTAS)) {
      expect(deModulos.has(t), t).toBe(true)
      expect(motivo.length, t).toBeGreaterThan(20)
    }
    for (const [t, cols] of Object.entries(PARCIALES)) {
      expect(deModulos.has(t), t).toBe(true)
      expect(EXENTAS[t], t).toBeUndefined()
      for (const [c, motivo] of Object.entries(cols)) {
        expect(['created_by', 'archivado_en'], `${t}.${c}`).toContain(c)
        expect(motivo.length, `${t}.${c}`).toBeGreaterThan(20)
      }
    }
  })

  it('el lector de contrato_aplicar entiende las dos formas de llamada', () => {
    const m = aplicaciones(`select public.contrato_aplicar('public.a');\nselect public.contrato_aplicar('public.b', array['created_by', 'archivado_en']);`)
    expect([...m.entries()]).toEqual([['a', []], ['b', ['archivado_en', 'created_by']]])
  })

  it('el lector de create table ve las tablas del módulo y no las temporales', () => {
    expect(tablasCreadas('create table if not exists public.a (id int);\ncreate table b (id int);\ncreate temp table c (id int);')).toEqual(['a', 'b'])
  })

  // Postgres dispara los BEFORE de una tabla por orden de nombre: el sello
  // va el último para que ningún trigger reescriba lo que selló
  it('ningún trigger BEFORE se dispara después del sello', () => {
    const sello = /format\('create trigger %I before insert or update on %I\.%I[^']*',\s+'(\w+)'/.exec(de('00b-contrato-tabla.sql'))![1]
    expect(sello).toBe('zz_contrato_sellar')
    const despues = archivos.flatMap((a) =>
      [...a.sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)\s+before\b/gi)]
        .map((m) => m[1].toLowerCase())
        .filter((n) => n >= sello)
        .map((n) => a.nombre + ': ' + n),
    )
    expect(despues).toEqual([])
  })

  describe('00b-contrato-tabla.sql', () => {
    const sql = de('00b-contrato-tabla.sql')
    const cuerpo = (nombre: string) => new RegExp(`function\\s+public\\.${nombre}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(sql)![1]

    it('es del núcleo y va entre 00-base y 01-seguridad', () => {
      const nombres = archivos.map((a) => a.nombre)
      expect(nombres.indexOf('00b-contrato-tabla.sql')).toBe(nombres.indexOf('00-base.sql') + 1)
      expect(nombres.indexOf('01-seguridad.sql')).toBe(nombres.indexOf('00b-contrato-tabla.sql') + 1)
    })

    it('contrato_sellar sella autoría y fechas en el alta y conserva created_by, created_at y creado_via en el cambio', () => {
      const c = cuerpo('contrato_sellar')
      const [alta, cambio] = c.split(/end if;/)
      expect(alta).toMatch(/tg_op = 'INSERT'/)
      expect(alta).toMatch(/'created_by', auth\.uid\(\), 'updated_by', auth\.uid\(\), 'created_at', now\(\), 'updated_at', now\(\)/)
      expect(alta).toMatch(/'creado_via', coalesce\(nullif\(to_jsonb\(new\) -> 'creado_via', 'null'::jsonb\), to_jsonb\('manual'::text\)\)/)
      for (const col of ['created_by', 'created_at', 'creado_via']) expect(cambio).toContain(`'${col}', v_antes -> '${col}'`)
      expect(cambio).toMatch(/'updated_by', auth\.uid\(\), 'updated_at', now\(\)/)
      expect(c).toMatch(/jsonb_populate_record\(new,/)
      // archivado_en lo decide quien escribe: no se sella
      expect(c).not.toMatch(/archivado_en/)
      expect(sql).toMatch(/function public\.contrato_sellar\(\)\s+returns trigger language plpgsql set search_path = public, pg_temp as/)
      expect(sql).toMatch(/revoke execute on function public\.contrato_sellar\(\) from public, anon, authenticated;/)
    })

    it('contrato_aplicar añade las seis columnas, comprueba su tipo y pone el trigger; solo la ejecuta el dueño', () => {
      const c = cuerpo('contrato_aplicar')
      for (const col of COLUMNAS) expect(c, col).toContain(`('${col}', `)
      expect(c).toContain(`('creado_via', 'public.via_creacion not null default ''manual''', 'public.via_creacion'::regtype, true)`)
      expect(c).toContain(`('created_at', 'timestamptz not null default now()', 'timestamptz'::regtype, true)`)
      expect(c).toMatch(/x not in \('created_by', 'archivado_en'\)/)
      expect(c).toMatch(/add column if not exists %I %s/)
      expect(c).toMatch(/a\.atttypid <> c\.tipo or \(c\.obligatoria and not a\.attnotnull\)/)
      expect(c).toMatch(/format\('drop trigger if exists %I on %I\.%I', 'zz_contrato_sellar'/)
      expect(c).toMatch(/format\('create trigger %I before insert or update on %I\.%I for each row execute function public\.contrato_sellar\(\)',\s+'zz_contrato_sellar'/)
      expect(sql).not.toMatch(/function public\.contrato_aplicar\([^)]*\)[^$]*security\s+definer/i)
      expect(sql).toMatch(/revoke execute on function public\.contrato_aplicar\(regclass, text\[\]\) from public, anon, authenticated, service_role;/)
      expect(sql).not.toMatch(/grant\s+execute/i)
    })

    it('los dominios: vías cerradas, código como el de instalacion.moneda_base e importe numeric(18,4) sin NaN', () => {
      expect(sql).toMatch(/create domain public\.via_creacion as text\s+constraint via_creacion_check check \(value in \('manual', 'importacion', 'api', 'regla', 'sistema'\)\)/)
      expect(sql).toMatch(/create domain public\.codigo_moneda as text\s+constraint codigo_moneda_check check \(value ~ '\^\[A-Z\]\{3\}\$'\)/)
      expect(de('04-instalacion-modulos.sql')).toMatch(/check \(moneda_base ~ '\^\[A-Z\]\{3\}\$'\)/)
      expect(sql).toMatch(/create domain public\.importe as numeric\(18, 4\)\s+constraint importe_check check \(value <> 'NaN'::numeric\)/)
      // Un dominio no admite «if not exists»: cada uno se crea solo si falta
      expect(sql.match(/if to_regtype\('public\.(via_creacion|codigo_moneda|importe)'\) is null then\s+create domain/g)?.length).toBe(3)
    })

    it('la verificación prueba el sello y los dominios en una tabla temporal', () => {
      const v = sql.slice(sql.lastIndexOf('do $$'))
      expect(v).toMatch(/create temp table contrato_prueba/)
      expect(v).toMatch(/perform public\.contrato_aplicar\('contrato_prueba'::regclass\);/)
      expect(v).toMatch(/where created_by is null and updated_by is null and created_at = now\(\)/)
      for (const caso of ['moneda minúscula', 'moneda sin importe', 'importe sin moneda', 'importe NaN', 'vía desconocida']) expect(v).toContain(`'${caso}'`)
      expect(v).toMatch(/drop table contrato_prueba;\s+end \$\$;\s*$/)
    })
  })

  describe('21d-crm-contrato.sql', () => {
    const sql = de('21d-crm-contrato.sql')
    const definicion = (s: string) => /create or replace function public\.crm_registrar_cambio\(\)[\s\S]*?\$\$;/.exec(s)![0]

    it('exige 00b y 21 antes de cambiar nada', () => {
      expect(sql).toMatch(/to_regprocedure\('public\.contrato_aplicar\(regclass,text\[\]\)'\) is null[\s\S]*?raise exception '21d-crm-contrato detenido: falta 00b-contrato-tabla\.sql/)
      expect(sql).toMatch(/raise exception '21d-crm-contrato detenido: falta 21-crm\.sql'/)
    })

    it('crm_registrar_cambio es el de 21 sin updated_by ni creado_via en el historial', () => {
      const original = definicion(de('21-crm.sql'))
      expect(original.match(/ - 'updated_at'/g)?.length).toBe(2)
      expect(definicion(sql)).toBe(original.split(" - 'updated_at'").join(" - 'updated_at' - 'updated_by' - 'creado_via'"))
      expect(sql).toMatch(/revoke execute on function public\.crm_registrar_cambio\(\) from public, anon, authenticated;/)
    })

    it('la verificación comprueba columnas, triggers y el historial', () => {
      const v = sql.slice(sql.lastIndexOf('do $$'))
      expect(v).toContain("g.tgname = 'zz_contrato_sellar'")
      expect(v).toContain("(values ('updated_by'), ('creado_via'), ('created_at'), ('updated_at'))")
      expect(v).toContain("'- ''updated_at'' - ''updated_by'' - ''creado_via'''")
    })
  })
})

// Moneda como par (PP-DEC-24): un importe es <col> public.importe con
// <col>_moneda public.codigo_moneda y el check de pareja. Un numeric con
// nombre de dinero tiene que ser un importe.
const NOMBRE_DINERO = /^(importe|monto|precio|valor|total|subtotal|saldo|costo|impuesto|descuento|pago|abono|tarifa)(_|$)/

type Columna = { tabla: string; nombre: string; tipo: string }

// importe y codigo_moneda sin esquema son los mismos dominios
const tipoDeColumna = (t: string) => {
  const x = t.toLowerCase()
  return x === 'importe' || x === 'codigo_moneda' ? 'public.' + x : x
}

// Columnas de create table (separadas por comas de primer nivel) y de
// alter table … add column; los checks de cada tabla son el cuerpo de su
// create table y sus alter table … add constraint
function columnasDe(sql: string): { columnas: Columna[]; checks: Map<string, string> } {
  const columnas: Columna[] = []
  const checks = new Map<string, string>()
  const anadir = (tabla: string, texto: string) => checks.set(tabla, (checks.get(tabla) ?? '') + '\n' + texto)
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    let i = re.lastIndex
    let nivel = 1
    let parte = ''
    const partes: string[] = []
    while (i < sql.length && nivel > 0) {
      const ch = sql[i]
      if (ch === '(') nivel++
      else if (ch === ')') nivel--
      if (nivel === 1 && ch === ',') {
        partes.push(parte)
        parte = ''
      } else if (nivel > 0) parte += ch
      i++
    }
    partes.push(parte)
    anadir(m[1], sql.slice(re.lastIndex, i))
    for (const p of partes) {
      const c = /^\s*(\w+)\s+([\w.]+)/.exec(p)
      if (c && !/^(constraint|primary|unique|foreign|check|exclude)$/i.test(c[1])) columnas.push({ tabla: m[1], nombre: c[1], tipo: tipoDeColumna(c[2]) })
    }
  }
  for (const a of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)\s+([\w.]+)/gi)) {
    columnas.push({ tabla: a[1], nombre: a[2], tipo: tipoDeColumna(a[3]) })
  }
  for (const a of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+add\s+constraint\s[^;]*/gi)) anadir(a[1], a[0])
  return { columnas, checks }
}

function revisarImportes(sql: string): string[] {
  const { columnas, checks } = columnasDe(sql)
  const fallos: string[] = []
  const tipoDe = (tabla: string, nombre: string) => columnas.find((c) => c.tabla === tabla && c.nombre === nombre)?.tipo
  for (const c of columnas) {
    const id = `${c.tabla}.${c.nombre}`
    if (c.tipo === 'public.importe') {
      if (tipoDe(c.tabla, `${c.nombre}_moneda`) !== 'public.codigo_moneda') fallos.push(`${id}: sin ${c.nombre}_moneda public.codigo_moneda`)
      const pareja = new RegExp(`check\\s*\\(\\s*\\(\\s*${c.nombre}\\s+is\\s+null\\s*\\)\\s*=\\s*\\(\\s*${c.nombre}_moneda\\s+is\\s+null\\s*\\)\\s*\\)`, 'i')
      if (!pareja.test(checks.get(c.tabla) ?? '')) fallos.push(`${id}: sin el check de pareja con ${c.nombre}_moneda`)
    } else if (c.tipo === 'public.codigo_moneda') {
      const base = c.nombre.replace(/_moneda$/, '')
      if (base === c.nombre || tipoDe(c.tabla, base) !== 'public.importe') fallos.push(`${id}: código de moneda sin su importe`)
    } else if (/^(numeric|decimal|real|double|float\d*|money)$/.test(c.tipo) && NOMBRE_DINERO.test(c.nombre)) {
      fallos.push(`${id}: un importe va en public.importe con su moneda`)
    }
  }
  return fallos
}

describe('moneda como par (PP-DEC-24)', () => {
  it('acepta el par con su check, obligatorio u opcional, y los numeric que no son dinero', () => {
    const bien = `create table if not exists public.ventas (
      id uuid primary key,
      cantidad numeric(18, 4) not null,
      total public.importe not null,
      total_moneda public.codigo_moneda not null,
      anticipo public.importe,
      anticipo_moneda public.codigo_moneda,
      constraint ventas_total_moneda_check check ((total is null) = (total_moneda is null)),
      constraint ventas_anticipo_moneda_check check ((anticipo is null) = (anticipo_moneda is null))
    );`
    expect(revisarImportes(bien)).toEqual([])
  })

  it('rechaza un importe sin moneda o sin check, una moneda suelta y dinero en numeric', () => {
    expect(revisarImportes('create table if not exists public.t (id int, total public.importe);')).toEqual([
      't.total: sin total_moneda public.codigo_moneda',
      't.total: sin el check de pareja con total_moneda',
    ])
    expect(revisarImportes('create table if not exists public.t (total public.importe, total_moneda public.codigo_moneda);')).toEqual([
      't.total: sin el check de pareja con total_moneda',
    ])
    expect(revisarImportes('create table if not exists public.t (id int, moneda public.codigo_moneda);')).toEqual(['t.moneda: código de moneda sin su importe'])
    expect(revisarImportes('create table if not exists public.t (precio_unitario numeric(12, 2) not null);')).toEqual([
      't.precio_unitario: un importe va en public.importe con su moneda',
    ])
    expect(revisarImportes('alter table public.t add column if not exists saldo numeric;')).toEqual(['t.saldo: un importe va en public.importe con su moneda'])
  })

  it('el check de pareja cuenta solo en su tabla y los dominios sin esquema se revisan igual', () => {
    const otra = 'create table public.a (total public.importe, total_moneda public.codigo_moneda, constraint a_check check ((total is null) = (total_moneda is null)));'
    expect(revisarImportes(otra + '\ncreate table public.b (total public.importe, total_moneda public.codigo_moneda);')).toEqual([
      'b.total: sin el check de pareja con total_moneda',
    ])
    expect(
      revisarImportes(
        'create table public.b (total importe, total_moneda codigo_moneda);\nalter table public.b add constraint b_check check ((total is null) = (total_moneda is null));',
      ),
    ).toEqual([])
    expect(revisarImportes('create table public.t (id int, total importe);')).toEqual([
      't.total: sin total_moneda public.codigo_moneda',
      't.total: sin el check de pareja con total_moneda',
    ])
    expect(revisarImportes('create table public.t (id int, moneda codigo_moneda);')).toEqual(['t.moneda: código de moneda sin su importe'])
  })

  it.each(archivos.map((a) => [a.nombre, a] as const))('%s cumple la convención de importes', (_n, a) => {
    expect(revisarImportes(a.sql)).toEqual([])
  })
})

describe('comprobaciones fuera de las pruebas estáticas', () => {
  const verificar = readFileSync(CARPETA + 'verificar.sql', 'utf8')
  const sim = readFileSync(fileURLToPath(new URL('../../../supabase/pruebas/rls-simulacion.sql', import.meta.url)), 'utf8').replace(/\r\n?/g, '\n')
  const s16 = sim.split(/\n(?=-- ============ )/).find((b) => b.startsWith('-- ============ 16) '))!

  it('verificar.sql comprueba el contrato (15) y los importes (16)', () => {
    expect(verificar).toContain("'tablas de negocio con el contrato base y el trigger zz_contrato_sellar el último'")
    expect(verificar).toContain("t.relname in ('crm_cuentas', 'crm_contactos', 'crm_actividades')")
    expect(verificar).toContain("'importes con su columna de moneda'")
    expect(verificar).toMatch(/m\.attname = a\.attname \|\| '_moneda'/)
    expect(verificar).toContain("g.tgname = 'zz_contrato_sellar'")
    expect(verificar).toMatch(/\(o\.tgtype::int & 2\) <> 0\s+and o\.tgname > 'zz_contrato_sellar'::name/)
  })

  it('la sección 16 de rls-simulacion prueba dominios, sellos falsos, sin sesión, historial y actividades', () => {
    expect(s16).toContain('OMITIDO 16    contrato de tabla · falta 00b-contrato-tabla.sql')
    expect(s16).toContain('falta 21d-crm-contrato.sql')
    for (const caso of ['16.1', '16.2', '16.3', '16.4', '16.5', '16.6']) expect(s16, caso).toContain(`'${caso}  `)
    expect(s16).toMatch(/values \('persona', 'Prueba RLS contrato', v_otro, v_otro, '2000-01-01', '2000-01-01', 'importacion'\)/)
    expect(s16).toMatch(/campos && array\['updated_by', 'creado_via', 'updated_at'\]/)
  })
})
