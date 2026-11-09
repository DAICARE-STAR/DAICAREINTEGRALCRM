// Script de módulos con un cliente falso: dependencias, cascada, límites,
// el SQL del módulo una sola vez y la cadena de conexión fuera de la salida.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVAR_MODULO,
  CONSULTA_APLICADO,
  CONSULTA_FILAS,
  CONSULTA_HAY_TABLA,
  DESACTIVAR_MODULO,
  FUSIONAR_LIMITES,
  INSERT_MODULO,
  LIMITES_POR_DEFECTO,
  leerArgumentos,
  main,
} from '../modulos.mjs'
import { moduloPorSlug } from '../../../src/lib/modulos.ts'

// Valores armados al correr: este archivo no lleva ninguno literal
const CLAVE = ['Qw7', 'zR!', '2Kp'].join('')
const CADENA = `postgresql://postgres.ref:${encodeURIComponent(CLAVE)}@aws-0.pooler.supabase.com:5432/postgres`
const ENV = { SUPABASE_DB_URL: CADENA }

let carpeta
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'modulos-'))
  writeFileSync(join(carpeta, '11-chat.sql'), 'select 1;\n')
  writeFileSync(join(carpeta, '20-proyectos.sql'), 'select 1;\n')
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

const fila = (slug, activo = true, limites = {}) => ({ slug, activo, limites })

function clienteFalso({ filas = [fila('nucleo', true, { miembros: 10 })], aplicados = [], hayTabla = true, fallaEn = null } = {}) {
  const ejecutadas = []
  const consultar = async (texto, params) => {
    ejecutadas.push({ texto, params })
    if (fallaEn && texto === fallaEn) throw new Error(`error de sql con ${CADENA}`)
    if (texto === CONSULTA_HAY_TABLA) return [{ existe: hayTabla }]
    if (texto === CONSULTA_FILAS) return filas
    if (texto === CONSULTA_APLICADO) return aplicados.includes(params[0]) ? [{ aplicado: 1 }] : []
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

async function correr(argv, config = {}) {
  const cliente = clienteFalso(config)
  const salida = []
  const errores = []
  const aplicadas = []
  const codigo = await main(argv, {
    env: config.env ?? ENV,
    log: (s) => salida.push(String(s)),
    error: (s) => errores.push(String(s)),
    carpeta,
    crearCliente: async () => cliente,
    aplicarArchivo: async (ruta) => {
      aplicadas.push(ruta)
      return config.codigoAplicar ?? 0
    },
  })
  const escritas = (texto) => cliente.ejecutadas.filter((e) => e.texto === texto).map((e) => e.params)
  return { codigo, salida, errores, texto: [...salida, ...errores].join('\n'), cliente, aplicadas, escritas }
}

describe('modulos.mjs: opciones', () => {
  it('lee cada acción y rechaza combinaciones malas', () => {
    expect(leerArgumentos(['--listar'])).toMatchObject({ accion: 'listar' })
    expect(leerArgumentos(['--activar', 'ia', '--limites', '{"ia_dia_equipo": 50}'])).toMatchObject({ accion: 'activar', slug: 'ia', limites: { ia_dia_equipo: 50 } })
    expect(leerArgumentos(['--limites', 'nucleo', '{"miembros": 25}'])).toMatchObject({ accion: 'limites', slug: 'nucleo', limites: { miembros: 25 } })
    expect(leerArgumentos(['--desactivar', 'proyectos', '--cascada'])).toMatchObject({ accion: 'desactivar', cascada: true })
    expect(() => leerArgumentos([])).toThrow(/Falta la acción/)
    expect(() => leerArgumentos(['--listar', '--activar', 'ia'])).toThrow(/Una sola acción/)
    expect(() => leerArgumentos(['--activar', 'ia', '--cascada'])).toThrow(/--cascada/)
    expect(() => leerArgumentos(['--activar', 'ia', '--limites', '[1]'])).toThrow(/objeto JSON/)
    expect(() => leerArgumentos(['--activar'])).toThrow(/necesita un valor/)
  })

  it('una opción mala sale con 2 sin conectar', async () => {
    const r = await correr(['--borrar', 'chat'])
    expect(r.codigo).toBe(2)
    expect(r.cliente.ejecutadas).toEqual([])
  })
})

describe('modulos.mjs: activar', () => {
  it('sin las dependencias activas sale con 1 y nombra la que falta', async () => {
    const r = await correr(['--activar', 'cotizador'])
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/depende de productos/)
    expect(r.escritas(INSERT_MODULO)).toEqual([])
    expect(r.escritas(ACTIVAR_MODULO)).toEqual([])
  })

  it('un módulo desconocido o planeado no se activa', async () => {
    expect((await correr(['--activar', 'nada'])).codigo).toBe(1)
    const r = await correr(['--activar', 'inventario'], { filas: [fila('nucleo'), fila('productos')] })
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/planeado/)
  })

  it('aplica el SQL del módulo una sola vez: si ya figura en esquema_aplicado no lo vuelve a aplicar', async () => {
    const primera = await correr(['--activar', 'chat'])
    expect(primera.codigo).toBe(0)
    expect(primera.aplicadas).toEqual([join(carpeta, '11-chat.sql')])
    expect(primera.escritas(CONSULTA_APLICADO)).toEqual([['11-chat.sql']])
    expect(primera.escritas(INSERT_MODULO)).toEqual([['chat', '{}']])

    const segunda = await correr(['--activar', 'chat'], { filas: [fila('nucleo'), fila('chat', false)], aplicados: ['11-chat.sql'] })
    expect(segunda.codigo).toBe(0)
    expect(segunda.aplicadas).toEqual([])
    expect(segunda.escritas(ACTIVAR_MODULO)).toEqual([['chat', '{}']])
  })

  it('si el SQL del módulo falla, la fila no se escribe y sale con 1', async () => {
    const r = await correr(['--activar', 'chat'], { codigoAplicar: 1 })
    expect(r.codigo).toBe(1)
    expect(r.escritas(INSERT_MODULO)).toEqual([])
  })

  it('sin el archivo del módulo en supabase/esquema sale con 2 sin escribir', async () => {
    const r = await correr(['--activar', 'manuales'])
    expect(r.codigo).toBe(2)
    expect(r.errores[0]).toMatch(/13-manuales\.sql/)
    expect(r.aplicadas).toEqual([])
    expect(r.escritas(INSERT_MODULO)).toEqual([])
  })

  it('un módulo nuevo sin --limites recibe los límites por defecto (PP-LIM); con --limites, los dados', async () => {
    const ia = await correr(['--activar', 'ia'])
    expect(ia.escritas(INSERT_MODULO)).toEqual([['ia', JSON.stringify(LIMITES_POR_DEFECTO.ia)]])
    expect(LIMITES_POR_DEFECTO.ia).toEqual({ ia_hora_miembro: 20, ia_dia_equipo: 300 })
    const dados = await correr(['--activar', 'ia', '--limites', '{"ia_dia_equipo": 50}'])
    expect(dados.escritas(INSERT_MODULO)).toEqual([['ia', '{"ia_dia_equipo":50}']])
  })

  it('los límites por defecto solo usan claves declaradas por cada módulo', () => {
    for (const [slug, limites] of Object.entries(LIMITES_POR_DEFECTO)) {
      const m = moduloPorSlug(slug)
      for (const clave of Object.keys(limites)) expect(m.limites, `${slug}.${clave}`).toHaveProperty(clave)
    }
  })

  it('sin modulos_instalacion (falta 04) sale con 2', async () => {
    const r = await correr(['--activar', 'ia'], { hayTabla: false })
    expect(r.codigo).toBe(2)
    expect(r.errores[0]).toMatch(/modulos_instalacion/)
  })
})

describe('modulos.mjs: desactivar', () => {
  const activos = [fila('nucleo'), fila('proyectos'), fila('disenos'), fila('gerencia')]

  it('con dependientes activos sale con 1 y no escribe', async () => {
    const r = await correr(['--desactivar', 'proyectos'], { filas: activos })
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/disenos depende de proyectos/)
    expect(r.escritas(DESACTIVAR_MODULO)).toEqual([])
  })

  it('con --cascada desactiva los dependientes primero y el propio al final, en una transacción', async () => {
    const r = await correr(['--desactivar', 'proyectos', '--cascada'], { filas: activos })
    expect(r.codigo).toBe(0)
    expect(r.escritas(DESACTIVAR_MODULO).map((p) => p[0])).toEqual(['disenos', 'gerencia', 'proyectos'])
    const textos = r.cliente.ejecutadas.map((e) => e.texto)
    expect(textos.indexOf('BEGIN')).toBeLessThan(textos.indexOf(DESACTIVAR_MODULO))
    expect(textos.lastIndexOf(DESACTIVAR_MODULO)).toBeLessThan(textos.indexOf('COMMIT'))
    expect(r.salida.join('\n')).toMatch(/AVISO .*un minuto/)
  })

  it('el núcleo no se desactiva', async () => {
    const r = await correr(['--desactivar', 'nucleo'])
    expect(r.codigo).toBe(1)
    expect(r.escritas(DESACTIVAR_MODULO)).toEqual([])
  })
})

describe('modulos.mjs: límites y listado', () => {
  it('una clave de límite desconocida sale con 1 sin conectar', async () => {
    const r = await correr(['--limites', 'nucleo', '{"cupo": 3}'])
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/cupo/)
    expect(r.cliente.ejecutadas).toEqual([])
    expect((await correr(['--limites', 'nucleo', '{"miembros": -1}'])).codigo).toBe(1)
    expect((await correr(['--activar', 'ia', '--limites', '{"miembros": 5}'])).codigo).toBe(1)
  })

  it('fusiona los límites de un módulo con fila; sin fila sale con 1', async () => {
    const r = await correr(['--limites', 'nucleo', '{"miembros": 25, "almacenamiento_mb": null}'])
    expect(r.codigo).toBe(0)
    expect(r.escritas(FUSIONAR_LIMITES)).toEqual([['nucleo', '{"miembros":25,"almacenamiento_mb":null}']])
    expect((await correr(['--limites', 'ia', '{"ia_dia_equipo": 9}'])).codigo).toBe(1)
  })

  it('--listar muestra nucleo activo con sus límites y los demás del registro', async () => {
    const r = await correr(['--listar'], { filas: [fila('nucleo', true, { miembros: 10 }), fila('chat', false), fila('viejo', true)] })
    expect(r.codigo).toBe(0)
    expect(r.salida).toContain('nucleo · activo · límites {"miembros":10}')
    expect(r.salida).toContain('chat · inactivo · límites {}')
    expect(r.salida).toContain('inventario · planeado')
    expect(r.salida).toContain('viejo · fuera del registro · activo')
  })
})

describe('modulos.mjs: cadena de conexión', () => {
  it('sin SUPABASE_DB_URL sale con 2 sin conectar', async () => {
    const r = await correr(['--listar'], { env: {} })
    expect(r.codigo).toBe(2)
    expect(r.errores[0]).toMatch(/Falta SUPABASE_DB_URL/)
  })

  it('un error de sql sale con 1 y no muestra la cadena ni la contraseña', async () => {
    const r = await correr(['--listar'], { fallaEn: CONSULTA_FILAS })
    expect(r.codigo).toBe(1)
    expect(r.texto).not.toContain(CADENA)
    expect(r.texto).not.toContain(CLAVE)
    expect(r.texto).not.toContain(encodeURIComponent(CLAVE))
  })
})

// postgres.js serializa con JSON.stringify todo parámetro cuyo tipo inferido
// es jsonb: un texto JSON llegaría doblemente codificado (una cadena, no un
// objeto) y el check de limites lo rechaza. Por eso el parámetro viaja como
// text y la base lo convierte. Visto en la primera instalación real (0.2.7).
describe('parámetros jsonb de modulos.mjs', () => {
  it('los límites viajan como text y se convierten en la base', () => {
    for (const q of [INSERT_MODULO, ACTIVAR_MODULO, FUSIONAR_LIMITES]) {
      expect(q).toContain('$2::text::jsonb')
      expect(q).not.toMatch(/\$2::jsonb/)
    }
  })
})
