// Ensayo del esquema con un cliente falso: aplica los pendientes en una
// transacción que siempre se deshace, nunca registra huellas y, con
// --simular, activa los módulos y corre la simulación después de los
// pendientes, en la misma transacción. La cadena de conexión nunca sale.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONSULTA_APLICADOS, dependenciasFaltantes, leerArgumentos, leerResultado, main, validarSimulados } from '../ensayar.mjs'
import { CONSULTA_MFA, LLAMADA_MFA } from '../aplicar.mjs'
import { sha256 } from '../comun.mjs'
import { ACTIVAR_MODULO, CONSULTA_FILAS, CONSULTA_HAY_TABLA, INSERT_MODULO } from '../modulos.mjs'

// Valores armados al correr: este archivo no lleva ninguno literal
const CLAVE = ['Hn4', 'vX!', '8Tq'].join('')
const CADENA = `postgresql://postgres.ref:${encodeURIComponent(CLAVE)}@aws-0.pooler.supabase.com:5432/postgres`
const ENV = { SUPABASE_DB_URL: CADENA }
const SIMULACION = '-- simulación de prueba\nbegin;\nselect 1;\nrollback;\n'

let carpeta
let rutaSimulacion
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'ensayo-'))
  writeFileSync(join(carpeta, '00-base.sql'), 'select 0;\n')
  writeFileSync(join(carpeta, '21-crm.sql'), 'select 21;\n')
  writeFileSync(join(carpeta, '22-catalogo.sql'), 'select 22;\n')
  rutaSimulacion = join(carpeta, 'rls-simulacion.sql')
  writeFileSync(rutaSimulacion, SIMULACION)
})
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

const fila = (slug, activo = true) => ({ slug, activo, limites: {} })

function clienteFalso({ aplicados = [], filas = [fila('nucleo')], resultado = '3 OK · 0 FALLA · 0 OMITIDO', fallaEn = null, conMfa = true } = {}) {
  const ejecutadas = []
  const consultar = async (texto, params) => {
    ejecutadas.push({ texto, params })
    if (texto === CONSULTA_APLICADOS) return aplicados
    if (texto === CONSULTA_MFA) return conMfa ? [{ existe: 1 }] : []
    if (texto === CONSULTA_HAY_TABLA) return [{ existe: true }]
    if (texto === CONSULTA_FILAS) return filas
    if (fallaEn && texto.includes(fallaEn)) throw Object.assign(new Error(`error de sql con ${CADENA}`), { position: '3' })
    if (texto.startsWith('-- simulación de prueba')) {
      if (resultado === null) return []
      throw new Error(`rls-simulacion (se deshace todo): ${resultado}\nOK      1.1   caso bueno · ok\nFALLA   1.2   caso malo · ${CLAVE}\nOMITIDO 2     sección · falta algo`)
    }
    return []
  }
  return {
    ejecutadas,
    transaccion: async (fn) => {
      ejecutadas.push({ texto: 'BEGIN' })
      try {
        await fn({ consultar })
      } catch (e) {
        ejecutadas.push({ texto: 'ROLLBACK' })
        throw e
      }
      ejecutadas.push({ texto: 'COMMIT' })
    },
    consultar,
    cerrar: async () => ejecutadas.push({ texto: 'END' }),
  }
}

async function correr(argv, config = {}) {
  const cliente = clienteFalso(config)
  const salida = []
  const errores = []
  const codigo = await main(argv, {
    env: config.env ?? ENV,
    log: (s) => salida.push(String(s)),
    error: (s) => errores.push(String(s)),
    carpeta,
    rutaSimulacion,
    crearCliente: async () => cliente,
  })
  return { codigo, salida, errores, texto: [...salida, ...errores].join('\n'), cliente, orden: cliente.ejecutadas.map((e) => e.texto) }
}

describe('ensayar.mjs: opciones', () => {
  it('lee --simular con slugs separados por coma, sin repetidos', () => {
    expect(leerArgumentos([]).simular).toBeNull()
    expect(leerArgumentos(['--simular', 'productos, crm,productos']).simular).toEqual(['productos', 'crm'])
    expect(() => leerArgumentos(['--simular'])).toThrow(/slugs/)
    expect(() => leerArgumentos(['--simular', ' , '])).toThrow(/al menos un slug/)
    expect(() => leerArgumentos(['--otra'])).toThrow(/Opción desconocida/)
  })

  it('valida los módulos contra el registro: desconocido, núcleo y sin archivo no se simulan; un planeado con archivo sí, con aviso', () => {
    expect(validarSimulados(['inexistente'], carpeta).errores).toEqual(['módulo desconocido: inexistente'])
    expect(validarSimulados(['nucleo'], carpeta).errores[0]).toMatch(/núcleo/)
    expect(validarSimulados(['calendario'], carpeta).errores[0]).toMatch(/falta supabase\/esquema\/10-calendario\.sql/)
    expect(validarSimulados(['inventario'], carpeta).errores[0]).toMatch(/planeado sin archivo/)
    // Productos ya es disponible; cotizador sigue planeado: con su archivo en la carpeta, se simula con aviso
    expect(validarSimulados(['productos'], carpeta)).toEqual({ errores: [], avisos: [] })
    writeFileSync(join(carpeta, '23-cotizador.sql'), 'select 23;\n')
    const cotizador = validarSimulados(['cotizador'], carpeta)
    expect(cotizador.errores).toEqual([])
    expect(cotizador.avisos[0]).toMatch(/cotizador está planeado/)
    expect(validarSimulados(['crm'], carpeta)).toEqual({ errores: [], avisos: [] })
  })

  it('las dependencias duras van activas en la base o antes en la lista', () => {
    expect(dependenciasFaltantes(['cotizador'], [])).toEqual(['cotizador depende de productos, que no está activo ni va antes en --simular'])
    expect(dependenciasFaltantes(['productos', 'cotizador'], [])).toEqual([])
    expect(dependenciasFaltantes(['cotizador'], ['productos'])).toEqual([])
  })

  it('lee el resultado como simular.mjs: resumen, FALLA y OMITIDO, y la salida por el peor', () => {
    const lineas = []
    const malo = new Error('rls-simulacion (se deshace todo): 1 OK · 1 FALLA · 1 OMITIDO\nOK      1.1   a\nFALLA   1.2   b\nOMITIDO 2     c')
    expect(leerResultado(malo, CADENA, (s) => lineas.push(s))).toBe(1)
    expect(lineas).toEqual(['rls-simulacion (se deshace todo): 1 OK · 1 FALLA · 1 OMITIDO', 'FALLA   1.2   b', 'OMITIDO 2     c'])
    expect(leerResultado(new Error('rls-simulacion (se deshace todo): 2 OK · 0 FALLA · 1 OMITIDO'), CADENA, () => {})).toBe(2)
    expect(leerResultado(new Error('rls-simulacion (se deshace todo): 2 OK · 0 FALLA · 0 OMITIDO'), CADENA, () => {})).toBe(0)
    expect(leerResultado(new Error('syntax error at or near "x"'), CADENA, () => {})).toBe(1)
  })
})

describe('ensayar.mjs: contra un cliente falso', () => {
  it('sin --simular aplica los pendientes en una transacción que se deshace y no registra huellas', async () => {
    const r = await correr([], { aplicados: [{ archivo: '00-base.sql', sha256: sha256('select 0;\n') }] })
    expect(r.codigo).toBe(0)
    expect(r.orden).toEqual([CONSULTA_APLICADOS, 'BEGIN', 'select 21;\n', 'select 22;\n', 'ROLLBACK', 'END'])
    expect(r.texto).not.toMatch(/insert into instalador/i)
  })

  it('con --simular: pendientes, aplicar_exigir_mfa, activación y simulación, en ese orden y en la misma transacción', async () => {
    const r = await correr(['--simular', 'productos'], { resultado: '3 OK · 0 FALLA · 0 OMITIDO' })
    expect(r.codigo).toBe(0)
    const sim = r.orden.findIndex((t) => t.startsWith('-- simulación de prueba'))
    expect(r.orden.slice(0, sim + 1)).toEqual([
      CONSULTA_APLICADOS, 'BEGIN', 'select 0;\n', 'select 21;\n', 'select 22;\n',
      CONSULTA_MFA, LLAMADA_MFA, CONSULTA_HAY_TABLA, CONSULTA_FILAS, INSERT_MODULO, SIMULACION,
    ])
    expect(r.orden.slice(sim + 1)).toEqual(['ROLLBACK', 'END'])
    expect(r.orden).not.toContain('COMMIT')
    expect(r.cliente.ejecutadas.some((e) => /insert into instalador\.esquema_aplicado/i.test(e.texto))).toBe(false)
    expect(r.cliente.ejecutadas.find((e) => e.texto === INSERT_MODULO).params).toEqual(['productos', '{}'])
    expect(r.texto).not.toMatch(/está planeado/)
    expect(r.salida).toContain('rls-simulacion (se deshace todo): 3 OK · 0 FALLA · 0 OMITIDO')
  })

  it('un módulo con fila se reactiva fusionando límites vacíos, como modulos.mjs --activar', async () => {
    const r = await correr(['--simular', 'crm'], { filas: [fila('nucleo'), fila('crm', false)] })
    expect(r.cliente.ejecutadas.find((e) => e.texto === ACTIVAR_MODULO).params).toEqual(['crm', '{}'])
    expect(r.orden).not.toContain(INSERT_MODULO)
  })

  it('muestra FALLA y OMITIDO de la simulación, sale 1 con FALLA y 2 con solo OMITIDO, y oculta la cadena', async () => {
    const falla = await correr(['--simular', 'crm'], { resultado: '1 OK · 1 FALLA · 1 OMITIDO' })
    expect(falla.codigo).toBe(1)
    expect(falla.salida.filter((l) => /^(FALLA|OMITIDO)/.test(l))).toHaveLength(2)
    expect(falla.texto).not.toContain(CLAVE)
    expect(falla.texto).not.toMatch(/^OK      1\.1/m)
    expect((await correr(['--simular', 'crm'], { resultado: '2 OK · 0 FALLA · 1 OMITIDO' })).codigo).toBe(2)
  })

  it('si un pendiente falla, la simulación no corre y sale 1 sin la cadena', async () => {
    const r = await correr(['--simular', 'crm'], { fallaEn: 'select 21' })
    expect(r.codigo).toBe(1)
    expect(r.orden.some((t) => t.startsWith('-- simulación'))).toBe(false)
    expect(r.salida).toContain('OMITIDO la simulación no corre: un archivo pendiente no aplica')
    expect(r.texto).not.toContain(CLAVE)
    expect(r.texto).not.toContain(CADENA)
  })

  it('una simulación que no termina en su error es FALLA; un módulo sin archivo o sin la variable, 2', async () => {
    expect((await correr(['--simular', 'crm'], { resultado: null })).codigo).toBe(1)
    const dep = await correr(['--simular', 'cotizador'])
    expect(dep.codigo).toBe(2)
    expect(dep.texto).toMatch(/falta supabase\/esquema\/23-cotizador\.sql/)
    expect((await correr(['--simular', 'crm'], { env: {} })).codigo).toBe(2)
  })
})
