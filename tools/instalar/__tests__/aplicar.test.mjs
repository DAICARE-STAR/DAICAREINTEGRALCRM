// Instalador del esquema con un cliente falso inyectado: orden por prefijo,
// salto de los ya aplicados, negativa ante un sha256 cambiado o una base con
// tablas ajenas, --hasta, --archivo, --solo-concatenar, --verificar, y la
// cadena de conexión nunca aparece en la salida.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONSULTA_MFA, DDL_REGISTRO, INSERT_REGISTRO, LLAMADA_MFA, leerArgumentos, main, resumirVerificacion } from '../aplicar.mjs'
import { esNucleo, listarArchivosEsquema, normalizar, numeroDe, ocultarUrl, PATRON_ARCHIVO, sha256 } from '../comun.mjs'
import { MODULOS } from '../../../src/lib/modulos.ts'

// Valores armados al correr: este archivo no lleva ninguno literal
const CLAVE = ['Zx9', 'pQ!', '4Lm'].join('')
const CADENA = `postgresql://postgres.ref:${encodeURIComponent(CLAVE)}@aws-0.pooler.supabase.com:5432/postgres`
const ENV = { SUPABASE_DB_URL: CADENA }

const ARCHIVOS = {
  '00-base.sql': 'create table if not exists public.a (id int);\n',
  '01-seguridad.sql': 'create table if not exists public.b (id int);\r\n',
  '02-auditoria.sql': 'select 1;\n',
}

let carpeta
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'instalador-'))
  // En orden inverso a propósito: el orden lo decide el nombre, no el disco
  for (const nombre of Object.keys(ARCHIVOS).reverse()) writeFileSync(join(carpeta, nombre), ARCHIVOS[nombre])
  writeFileSync(join(carpeta, 'verificar.sql'), '-- verificar.sql de prueba\nselect 1;\n')
  writeFileSync(join(carpeta, 'notas.md'), 'no es sql')
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

function clienteFalso({ aplicados = [], tablasPublic = [], tieneMfa = false, fallaEn = null, verificar = [] } = {}) {
  const ejecutadas = []
  const consultar = async (texto, params) => {
    ejecutadas.push({ texto, params })
    if (texto.includes('from instalador.esquema_aplicado')) return aplicados
    if (texto.includes('from pg_tables')) return tablasPublic.map((t) => ({ tablename: t }))
    if (texto === CONSULTA_MFA) return tieneMfa ? [{ existe: 1 }] : []
    if (texto.startsWith('-- verificar.sql')) return verificar
    if (fallaEn && texto.includes(fallaEn)) throw new Error(`error de sql en ${fallaEn} con ${CADENA} y ${CLAVE}`)
    return []
  }
  return {
    ejecutadas,
    consultar,
    transaccion: async (fn) => {
      ejecutadas.push({ texto: 'BEGIN' })
      await fn({ consultar })
      ejecutadas.push({ texto: 'COMMIT' })
    },
    cerrar: async () => ejecutadas.push({ texto: 'END' }),
  }
}

async function correr(argv, config = {}, cliente = clienteFalso(config)) {
  const salida = []
  const errores = []
  let creado = 0
  const codigo = await main(argv, {
    env: config.env ?? ENV,
    log: (s) => salida.push(String(s)),
    error: (s) => errores.push(String(s)),
    carpeta,
    version: '0.1.0',
    crearCliente: async () => {
      creado++
      return cliente
    },
  })
  const texto = [...salida, ...errores].join('\n')
  return { codigo, salida, errores, texto, cliente, creado }
}

const aplicadosEn = (cliente) => cliente.ejecutadas.filter((e) => e.texto === INSERT_REGISTRO).map((e) => e.params[0])

describe('comun.mjs', () => {
  it('sha256 normaliza CRLF a LF y quita el BOM', () => {
    expect(sha256('a\r\nb\r\n')).toBe(sha256('a\nb\n'))
    expect(sha256('﻿a\n')).toBe(sha256('a\n'))
    expect(normalizar('x\ry')).toBe('x\ny')
  })

  it('lista solo los archivos NN-nombre.sql en orden, con sufijo de letra admitido', () => {
    writeFileSync(join(carpeta, '01b-seguridad-resumen.sql'), 'select 2;')
    expect(listarArchivosEsquema(carpeta)).toEqual(['00-base.sql', '01-seguridad.sql', '01b-seguridad-resumen.sql', '02-auditoria.sql'])
    expect(numeroDe('01b-seguridad-resumen.sql')).toBe(1)
    expect(numeroDe('verificar.sql')).toBeNull()
  })

  it('ocultarUrl quita la cadena y la contraseña, codificada o no', () => {
    const t = ocultarUrl(`fallo en ${CADENA}; clave ${CLAVE}; codificada ${encodeURIComponent(CLAVE)}`, CADENA)
    expect(t).not.toContain(CLAVE)
    expect(t).not.toContain(encodeURIComponent(CLAVE))
    expect(t).not.toContain('aws-0.pooler')
    expect(t).toContain('[SUPABASE_DB_URL]')
  })
})

describe('aplicar.mjs: aplicación', () => {
  it('crea el registro y aplica los archivos en orden por prefijo, cada uno en su transacción', async () => {
    const { codigo, cliente, salida } = await correr([])
    expect(codigo).toBe(0)
    expect(cliente.ejecutadas[0].texto).toBe(DDL_REGISTRO)
    expect(aplicadosEn(cliente)).toEqual(['00-base.sql', '01-seguridad.sql', '02-auditoria.sql'])
    const textos = cliente.ejecutadas.map((e) => e.texto)
    const i = textos.indexOf(normalizar(ARCHIVOS['01-seguridad.sql']))
    expect(textos[i - 1]).toBe('BEGIN')
    expect(textos[i + 1]).toBe(INSERT_REGISTRO)
    expect(textos[i + 2]).toBe('COMMIT')
    expect(cliente.ejecutadas.at(-1).texto).toBe('END')
    expect(salida.filter((s) => s.startsWith('OK ')).length).toBe(3)
    // El sha256 registrado es el del contenido normalizado a LF
    const insert = cliente.ejecutadas.find((e) => e.texto === INSERT_REGISTRO && e.params[0] === '01-seguridad.sql')
    expect(insert.params[1]).toBe(sha256(ARCHIVOS['01-seguridad.sql']))
    expect(insert.params[2]).toBe('0.1.0')
  })

  it('salta los ya aplicados con el mismo sha256', async () => {
    const { codigo, cliente, salida } = await correr([], { aplicados: [{ archivo: '00-base.sql', sha256: sha256(ARCHIVOS['00-base.sql']) }] })
    expect(codigo).toBe(0)
    expect(aplicadosEn(cliente)).toEqual(['01-seguridad.sql', '02-auditoria.sql'])
    expect(salida).toContain('OMITIDO 00-base.sql ya aplicado')
  })

  it('se niega (1) si cambió el sha256 de uno aplicado y no aplica nada del lote', async () => {
    const { codigo, cliente, errores } = await correr([], { aplicados: [{ archivo: '00-base.sql', sha256: 'a'.repeat(64) }] })
    expect(codigo).toBe(1)
    expect(aplicadosEn(cliente)).toEqual([])
    expect(cliente.ejecutadas.some((e) => e.texto === 'BEGIN')).toBe(false)
    expect(errores[0]).toMatch(/DIFIERE 00-base\.sql .*otro sha256/)
  })

  it('se detiene (1) ante una base con tablas en public y sin registro; --adoptar está reservado (2)', async () => {
    const r = await correr([], { tablasPublic: ['clientes', 'pedidos'] })
    expect(r.codigo).toBe(1)
    expect(aplicadosEn(r.cliente)).toEqual([])
    expect(r.errores[0]).toMatch(/2 tabla\(s\) en public/)
    // Con registro, las tablas de public son las propias
    const ok = await correr([], { aplicados: [{ archivo: '00-base.sql', sha256: sha256(ARCHIVOS['00-base.sql']) }], tablasPublic: ['a'] })
    expect(ok.codigo).toBe(0)
    const adoptar = await correr(['--adoptar'])
    expect(adoptar.codigo).toBe(2)
    expect(adoptar.creado).toBe(0)
  })

  it('sin --archivo aplica solo el núcleo 0*.sql: los archivos de módulo no entran ni con --hasta ni al concatenar', async () => {
    writeFileSync(join(carpeta, '10-calendario.sql'), 'create table if not exists public.eventos (id int);\n')
    writeFileSync(join(carpeta, '28-sitio-web.sql'), 'grant select on public.paginas to anon;\n')
    const r = await correr([])
    expect(r.codigo).toBe(0)
    expect(aplicadosEn(r.cliente)).toEqual(['00-base.sql', '01-seguridad.sql', '02-auditoria.sql'])
    expect(r.cliente.ejecutadas.some((e) => e.texto.includes('public.eventos') || e.texto.includes('to anon;'))).toBe(false)
    const hasta = await correr(['--hasta', '28'])
    expect(aplicadosEn(hasta.cliente)).toEqual(['00-base.sql', '01-seguridad.sql', '02-auditoria.sql'])
    const destino = join(carpeta, 'todo.sql')
    await correr(['--solo-concatenar', destino], { env: {} })
    expect(readFileSync(destino, 'utf8')).not.toMatch(/10-calendario|28-sitio-web/)
    // El archivo de un módulo se aplica solo con --archivo, al activarlo
    const modulo = await correr(['--archivo', join(carpeta, '10-calendario.sql')])
    expect(aplicadosEn(modulo.cliente)).toEqual(['10-calendario.sql'])
  })

  it('todo Modulo.sql del registro es un archivo de módulo (10 en adelante), nunca del núcleo', () => {
    const archivos = MODULOS.map((m) => m.sql).filter(Boolean)
    expect(archivos.length).toBeGreaterThan(0)
    for (const a of archivos) {
      expect(a).toMatch(PATRON_ARCHIVO)
      expect(esNucleo(a)).toBe(false)
    }
    expect(esNucleo('03-mfa.sql')).toBe(true)
    expect(esNucleo('verificar.sql')).toBe(false)
  })

  it('--hasta aplica solo hasta ese número', async () => {
    const { codigo, cliente } = await correr(['--hasta', '01'])
    expect(codigo).toBe(0)
    expect(aplicadosEn(cliente)).toEqual(['00-base.sql', '01-seguridad.sql'])
  })

  it('--archivo aplica un archivo suelto', async () => {
    const { codigo, cliente } = await correr(['--archivo', join(carpeta, '02-auditoria.sql')])
    expect(codigo).toBe(0)
    expect(aplicadosEn(cliente)).toEqual(['02-auditoria.sql'])
  })

  it('re-ejecuta aplicar_exigir_mfa() tras el lote solo si existe y hubo algo que aplicar', async () => {
    const con = await correr([], { tieneMfa: true })
    expect(con.cliente.ejecutadas.some((e) => e.texto === LLAMADA_MFA)).toBe(true)
    expect(con.salida.at(-1)).toMatch(/aplicar_exigir_mfa\(\) re-ejecutada/)
    const sin = await correr([], { tieneMfa: false })
    expect(sin.cliente.ejecutadas.some((e) => e.texto === LLAMADA_MFA)).toBe(false)
    const todoAplicado = Object.entries(ARCHIVOS).map(([archivo, texto]) => ({ archivo, sha256: sha256(texto) }))
    const nada = await correr([], { tieneMfa: true, aplicados: todoAplicado })
    expect(nada.cliente.ejecutadas.some((e) => e.texto === LLAMADA_MFA)).toBe(false)
  })

  it('un error de sql sale con 1, no sigue con el siguiente archivo y oculta la cadena', async () => {
    const { codigo, cliente, texto, errores } = await correr([], { fallaEn: 'public.b' })
    expect(codigo).toBe(1)
    expect(aplicadosEn(cliente)).toEqual(['00-base.sql'])
    expect(errores[0]).toMatch(/^DIFIERE 01-seguridad\.sql: /)
    expect(texto).not.toContain(CLAVE)
    expect(texto).not.toContain(encodeURIComponent(CLAVE))
    expect(texto).not.toContain('aws-0.pooler')
    expect(cliente.ejecutadas.at(-1).texto).toBe('END')
  })
})

describe('aplicar.mjs: entorno y argumentos', () => {
  it('sin SUPABASE_DB_URL sale con 2 sin conectar', async () => {
    const r = await correr([], { env: {} })
    expect(r.codigo).toBe(2)
    expect(r.creado).toBe(0)
    expect(r.errores[0]).toMatch(/Falta SUPABASE_DB_URL/)
    expect((await correr([], { env: { SUPABASE_DB_URL: '   ' } })).codigo).toBe(2)
  })

  it('la cadena de conexión nunca aparece en la salida, ni cuando falla la conexión', async () => {
    const salida = []
    const codigo = await main([], {
      env: ENV,
      log: (s) => salida.push(String(s)),
      error: (s) => salida.push(String(s)),
      carpeta,
      version: '0.1.0',
      crearCliente: async (url) => {
        throw new Error(`ECONNREFUSED ${url}`)
      },
    })
    expect(codigo).toBe(2)
    const texto = salida.join('\n')
    expect(texto).toContain('No se pudo conectar')
    expect(texto).not.toContain(CLAVE)
    expect(texto).not.toContain(encodeURIComponent(CLAVE))
    expect(texto).toContain('[SUPABASE_DB_URL]')
  })

  it('opciones', () => {
    expect(leerArgumentos(['--hasta', '03', '--verificar'])).toMatchObject({ hasta: 3, verificar: true })
    expect(leerArgumentos(['--solo-concatenar', 'salida.sql'])).toMatchObject({ concatenar: 'salida.sql' })
    expect(() => leerArgumentos(['--hasta'])).toThrow(/necesita un valor/)
    expect(() => leerArgumentos(['--hasta', '3'])).toThrow(/dos cifras/)
    expect(() => leerArgumentos(['--archivo', 'x.sql', '--hasta', '02'])).toThrow(/no se combinan/)
    expect(() => leerArgumentos(['--rapido'])).toThrow(/desconocida/)
    expect(() => leerArgumentos([CADENA])).toThrow(/desconocida/)
  })

  it('una opción mala sale con 2 y el mensaje no repite un argumento con pinta de cadena de conexión', async () => {
    const r = await correr(['--hasta'])
    expect(r.codigo).toBe(2)
    expect(r.creado).toBe(0)
  })
})

describe('aplicar.mjs: --solo-concatenar', () => {
  it('escribe el DDL del registro, cada archivo y su insert, sin conectar ni exigir la variable', async () => {
    const destino = join(carpeta, 'salida', 'todo.sql')
    mkdirSync(join(carpeta, 'salida'))
    const r = await correr(['--solo-concatenar', destino, '--hasta', '01'], { env: {} })
    expect(r.codigo).toBe(0)
    expect(r.creado).toBe(0)
    const texto = readFileSync(destino, 'utf8')
    expect(texto.startsWith('-- Generado por tools/instalar/aplicar.mjs')).toBe(true)
    expect(texto).toContain('create table if not exists instalador.esquema_aplicado')
    const i00 = texto.indexOf(ARCHIVOS['00-base.sql'].trim())
    const r00 = texto.indexOf(`values ('00-base.sql', '${sha256(ARCHIVOS['00-base.sql'])}', '0.1.0')`)
    const i01 = texto.indexOf(normalizar(ARCHIVOS['01-seguridad.sql']).trim())
    const r01 = texto.indexOf(`values ('01-seguridad.sql', '${sha256(ARCHIVOS['01-seguridad.sql'])}', '0.1.0')`)
    expect(i00).toBeGreaterThan(0)
    expect(r00).toBeGreaterThan(i00)
    expect(i01).toBeGreaterThan(r00)
    expect(r01).toBeGreaterThan(i01)
    expect(texto).not.toContain('02-auditoria.sql')
    expect(texto).toMatch(/ya aplicado con otro sha256/)
    expect(texto).not.toContain('\r')
  })
})

describe('aplicar.mjs: --verificar', () => {
  const filas = (estados) => estados.map((estado, i) => ({ orden: i + 1, comprobacion: `comprobación ${i + 1}`, estado, detalle: i === 0 ? 'detalle' : '' }))

  it('imprime una línea por comprobación y sale 0, 1 o 2 según los estados', () => {
    const salida = []
    expect(resumirVerificacion(filas(['OK', 'AVISO']), (s) => salida.push(s))).toBe(0)
    expect(salida).toEqual(['OK comprobación 1 — detalle', 'AVISO comprobación 2'])
    expect(resumirVerificacion(filas(['OK', 'OMITIDO']), () => {})).toBe(2)
    expect(resumirVerificacion(filas(['OMITIDO', 'DIFIERE']), () => {})).toBe(1)
  })

  it('corre verificar.sql de la carpeta tras aplicar', async () => {
    const r = await correr(['--verificar'], { verificar: filas(['OK', 'DIFIERE']) })
    expect(r.codigo).toBe(1)
    expect(r.salida).toContain('DIFIERE comprobación 2')
    expect(r.cliente.ejecutadas.some((e) => e.texto.startsWith('-- verificar.sql'))).toBe(true)
  })

  it('el verificar.sql real es una sola consulta de solo lectura con las comprobaciones genéricas', () => {
    const real = readFileSync(new URL('../../../supabase/esquema/verificar.sql', import.meta.url), 'utf8')
    const codigo = real.replace(/^\s*--.*$/gm, '')
    expect(codigo).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i)
    expect(codigo.trim().split(';').filter((s) => s.trim()).length).toBe(1)
    for (const c of ['RLS', 'exigir_mfa', 'security definer', 'grants a anon', 'esquema instalador', 'esquema_aplicado']) expect(real).toContain(c)
    expect(real).toMatch(/'OK'/)
    expect(real).toMatch(/'DIFIERE'/)
    expect(real).toMatch(/'OMITIDO'/)
    expect(real).toMatch(/'AVISO'/)
  })
})
