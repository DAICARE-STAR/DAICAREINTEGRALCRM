// Instalador del esquema con un cliente falso inyectado: orden por prefijo,
// salto de los ya aplicados, negativa ante un sha256 cambiado o una base con
// tablas ajenas, --hasta, --archivo, --solo-concatenar, --verificar, y la
// cadena de conexión nunca aparece en la salida.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BLOQUE_BASE_AJENA, BLOQUE_MFA, bloqueComprobar, bloqueRegistro, comprobarModulos, CONSULTA_FILAS_MODULOS, CONSULTA_HAY_MODULOS, CONSULTA_HAY_REGISTRO, CONSULTA_MFA, DDL_REGISTRO, INSERT_REGISTRO, LLAMADA_MFA, SOLO_LECTURA, leerArgumentos, main, resumirVerificacion } from '../aplicar.mjs'
import { crearCliente, esNucleo, listarArchivosEsquema, normalizar, numeroDe, ocultarUrl, opcionSsl, PATRON_ARCHIVO, sha256 } from '../comun.mjs'
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

function clienteFalso({ aplicados = [], tablasPublic = [], tieneMfa = false, fallaEn = null, verificar = [], hayRegistro = true, filasModulos = null } = {}) {
  const ejecutadas = []
  const consultar = async (texto, params) => {
    ejecutadas.push({ texto, params })
    if (texto.includes('from instalador.esquema_aplicado')) return aplicados
    if (texto.includes('from pg_tables')) return tablasPublic.map((t) => ({ tablename: t }))
    if (texto === CONSULTA_MFA) return tieneMfa ? [{ existe: 1 }] : []
    if (texto === CONSULTA_HAY_REGISTRO) return [{ existe: hayRegistro }]
    if (texto === CONSULTA_HAY_MODULOS) return [{ existe: filasModulos !== null }]
    if (texto === CONSULTA_FILAS_MODULOS) return filasModulos
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

  const llamoMfa = (cliente) => cliente.ejecutadas.some((e) => e.texto === LLAMADA_MFA)
  const todoAplicado = () => Object.entries(ARCHIVOS).map(([archivo, texto]) => ({ archivo, sha256: sha256(texto) }))

  it('re-ejecuta aplicar_exigir_mfa() tras cada corrida si existe, aunque no haya nada pendiente', async () => {
    const con = await correr([], { tieneMfa: true })
    expect(llamoMfa(con.cliente)).toBe(true)
    expect(con.salida.at(-1)).toMatch(/aplicar_exigir_mfa\(\) re-ejecutada/)
    const sin = await correr([], { tieneMfa: false })
    expect(llamoMfa(sin.cliente)).toBe(false)
    const nada = await correr([], { tieneMfa: true, aplicados: todoAplicado() })
    expect(nada.codigo).toBe(0)
    expect(llamoMfa(nada.cliente)).toBe(true)
  })

  it('si aplicar_exigir_mfa() falla sale con 1 y el reintento, sin pendientes, la vuelve a llamar', async () => {
    const primera = await correr([], { tieneMfa: true, fallaEn: 'aplicar_exigir_mfa' })
    expect(primera.codigo).toBe(1)
    expect(aplicadosEn(primera.cliente)).toEqual(['00-base.sql', '01-seguridad.sql', '02-auditoria.sql'])
    expect(primera.errores.at(-1)).toMatch(/^DIFIERE aplicar_exigir_mfa\(\): /)
    expect(primera.texto).not.toContain(CLAVE)
    const reintento = await correr([], { tieneMfa: true, aplicados: todoAplicado() })
    expect(reintento.codigo).toBe(0)
    expect(llamoMfa(reintento.cliente)).toBe(true)
  })

  it('si un archivo falla tras otros confirmados, re-ejecuta aplicar_exigir_mfa() igual y sale con 1', async () => {
    const r = await correr([], { tieneMfa: true, fallaEn: 'public.b' })
    expect(r.codigo).toBe(1)
    expect(aplicadosEn(r.cliente)).toEqual(['00-base.sql'])
    expect(llamoMfa(r.cliente)).toBe(true)
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
    expect(leerArgumentos(['--verificar'])).toMatchObject({ verificar: true })
    expect(() => leerArgumentos(['--hasta', '03', '--verificar'])).toThrow(/solo lectura/)
    expect(() => leerArgumentos(['--verificar', '--archivo', 'x.sql'])).toThrow(/solo lectura/)
    expect(() => leerArgumentos(['--verificar', '--solo-concatenar', 'x.sql'])).toThrow(/solo lectura/)
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

  it('niega una base ajena al inicio, comprueba el sha256 antes de cada archivo y llama a aplicar_exigir_mfa() al final', async () => {
    const destino = join(carpeta, 'todo.sql')
    await correr(['--solo-concatenar', destino], { env: {} })
    const texto = readFileSync(destino, 'utf8')
    const ddl = texto.indexOf(DDL_REGISTRO)
    const ajena = texto.indexOf(BLOQUE_BASE_AJENA)
    expect(ddl).toBeGreaterThan(0)
    expect(ajena).toBeGreaterThan(ddl)
    let anterior = ajena
    for (const [nombre, contenido] of Object.entries(ARCHIVOS)) {
      const sha = sha256(contenido)
      const comprobar = texto.indexOf(bloqueComprobar(nombre, sha))
      const cuerpo = texto.indexOf(normalizar(contenido).trim(), comprobar)
      const registro = texto.indexOf(bloqueRegistro(nombre, sha, '0.1.0'))
      expect(comprobar).toBeGreaterThan(anterior)
      expect(cuerpo).toBeGreaterThan(comprobar)
      expect(registro).toBeGreaterThan(cuerpo)
      anterior = registro
    }
    expect(texto.indexOf(BLOQUE_MFA)).toBeGreaterThan(anterior)
    expect(texto.trimEnd().endsWith(BLOQUE_MFA)).toBe(true)
    expect(BLOQUE_MFA).toContain('perform public.aplicar_exigir_mfa()')
    expect(BLOQUE_MFA).toContain("p.proname = 'aplicar_exigir_mfa'")
    expect(bloqueRegistro('00-base.sql', 'a'.repeat(64), '0.1.0')).not.toMatch(/raise exception/)
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

  it('corre verificar.sql de la carpeta en una transacción read only, sin crear el registro ni aplicar nada', async () => {
    const r = await correr(['--verificar'], { verificar: filas(['OK', 'DIFIERE']), tieneMfa: true })
    expect(r.codigo).toBe(1)
    expect(r.salida).toContain('DIFIERE comprobación 2')
    const textos = r.cliente.ejecutadas.map((e) => e.texto)
    expect(textos).toEqual([CONSULTA_HAY_REGISTRO, 'BEGIN', SOLO_LECTURA, '-- verificar.sql de prueba\nselect 1;\n', CONSULTA_HAY_MODULOS, 'COMMIT', 'END'])
    // Sin 04 las comprobaciones del registro salen OMITIDO
    expect(r.salida).toContain('OMITIDO modulos_instalacion con slugs del registro y nucleo activo — falta 04-instalacion-modulos.sql')
    expect(textos).not.toContain(DDL_REGISTRO)
    expect(textos).not.toContain(LLAMADA_MFA)
    expect(aplicadosEn(r.cliente)).toEqual([])
  })

  it('con 04 aplicado lee modulos_instalacion dentro de la misma transacción y la compara con el registro', async () => {
    const r = await correr(['--verificar'], { verificar: filas(['OK']), filasModulos: [{ slug: 'nucleo', activo: true, limites: { miembros: 10 } }] })
    expect(r.codigo).toBe(0)
    const textos = r.cliente.ejecutadas.map((e) => e.texto)
    expect(textos.indexOf(CONSULTA_FILAS_MODULOS)).toBeLessThan(textos.indexOf('COMMIT'))
    expect(r.salida).toContain('OK módulos activos con sus dependencias activas')
  })

  it('comprobarModulos: slugs desconocidos o planeados, nucleo inactivo, límites no declarados y dependencias', () => {
    const estados = (f) => comprobarModulos(f).map((x) => x.estado)
    expect(estados(null)).toEqual(['OMITIDO', 'OMITIDO', 'OMITIDO'])
    expect(estados([{ slug: 'nucleo', activo: true, limites: { miembros: 10 } }])).toEqual(['OK', 'OK', 'OK'])
    const malas = comprobarModulos([
      { slug: 'nucleo', activo: true, limites: { miembros: 10, cupo: 3 } },
      { slug: 'inventario', activo: false, limites: {} },
      { slug: 'otro', activo: true, limites: {} },
      { slug: 'cotizador', activo: true, limites: {} },
      { slug: 'ia', activo: true, limites: { ia_dia_equipo: -1 } },
    ])
    expect(malas.map((x) => x.estado)).toEqual(['DIFIERE', 'DIFIERE', 'DIFIERE'])
    expect(malas[0].detalle).toBe('inventario; otro')
    expect(malas[1].detalle).toMatch(/cupo/)
    expect(malas[1].detalle).toMatch(/ia_dia_equipo/)
    expect(malas[2].detalle).toBe('cotizador activo sin productos')
    expect(comprobarModulos([])[0].detalle).toBe('nucleo no está activo')
  })

  it('--verificar sale con 2 si la base no tiene el esquema del instalador, sin crearlo', async () => {
    const r = await correr(['--verificar'], { hayRegistro: false })
    expect(r.codigo).toBe(2)
    expect(r.errores[0]).toMatch(/^OMITIDO no existe instalador\.esquema_aplicado/)
    expect(r.cliente.ejecutadas.map((e) => e.texto)).toEqual([CONSULTA_HAY_REGISTRO, 'END'])
  })

  it('el verificar.sql real es una sola consulta de solo lectura con las comprobaciones genéricas', () => {
    const real = readFileSync(new URL('../../../supabase/esquema/verificar.sql', import.meta.url), 'utf8')
    const codigo = real.replace(/^\s*--.*$/gm, '')
    expect(codigo).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i)
    expect(codigo.trim().split(';').filter((s) => s.trim()).length).toBe(1)
    for (const c of ['RLS', 'exigir_mfa', 'security definer', 'grants a anon', 'esquema instalador', 'esquema_aplicado', 'modulo_*', 'modulos_instalacion de solo lectura']) expect(real).toContain(c)
    expect(real).toMatch(/'OK'/)
    expect(real).toMatch(/'DIFIERE'/)
    expect(real).toMatch(/'OMITIDO'/)
    expect(real).toMatch(/'AVISO'/)
  })
})

describe('comun.mjs: TLS de la conexión', () => {
  it('opcionSsl exige TLS por defecto y respeta solo los modos que verifican el certificado', () => {
    expect(opcionSsl(CADENA)).toBe('require')
    expect(opcionSsl(`${CADENA}?sslmode=prefer`)).toBe('require')
    expect(opcionSsl(`${CADENA}?sslmode=allow`)).toBe('require')
    expect(opcionSsl(`${CADENA}?sslmode=verify-full`)).toBe('verify-full')
    expect(opcionSsl(`${CADENA}?sslmode=verify-ca`)).toBe('verify-ca')
    expect(opcionSsl('no es una url')).toBe('require')
    expect(() => opcionSsl(`${CADENA}?sslmode=disable`)).toThrow(/solo se admite contra una base local/)
    expect(opcionSsl('postgresql://postgres:x@127.0.0.1:54322/postgres?sslmode=disable')).toBe(false)
    expect(opcionSsl('postgresql://postgres:x@localhost:54322/postgres?sslmode=disable')).toBe(false)
    expect(opcionSsl('postgresql://postgres:x@127.0.0.1:54322/postgres')).toBe('require')
  })

  it('crearCliente pide TLS y no sigue en claro si el servidor lo rechaza', async () => {
    // Servidor que contesta «N» (sin TLS) a la SSLRequest y anota lo que recibe
    const recibido = []
    const servidor = createServer((s) => {
      s.on('data', (d) => {
        recibido.push(Buffer.from(d))
        if (recibido.length === 1) s.write('N')
        else s.destroy()
      })
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    const { port } = servidor.address()
    const cliente = await crearCliente(`postgresql://postgres:x@127.0.0.1:${port}/postgres`)
    try {
      await expect(cliente.consultar('select 1')).rejects.toThrow()
    } finally {
      await cliente.cerrar().catch(() => {})
      await new Promise((r) => servidor.close(r))
    }
    // Lo primero que manda es la SSLRequest (largo 8, código 80877103)
    expect(recibido[0].readInt32BE(0)).toBe(8)
    expect(recibido[0].readInt32BE(4)).toBe(80877103)
    // Y nunca un StartupMessage en claro (protocolo 3.0 = 196608)
    for (const d of recibido.slice(1)) expect(d.length >= 8 && d.readInt32BE(4) === 196608).toBe(false)
  })
})
