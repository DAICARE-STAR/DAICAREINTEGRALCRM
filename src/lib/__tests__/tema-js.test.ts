import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { primitivasDe } from '../contraste'

// public/tema.js corre antes de pintar: fija data-theme desde pt_tema_v1 y
// aplica las primitivas en caché de pt_tema_valores_v1 con setProperty. Se
// ejecuta en un contexto aislado con un documento y un localStorage de
// mentira. Una clave fuera de la lista o un valor que no es hex se ignoran
// (ninguna caché manipulada inyecta CSS); un tema desconocido cae a claro.

const RUTA = fileURLToPath(new URL('../../../public/tema.js', import.meta.url))
const CODIGO = readFileSync(RUTA, 'utf8')
const PALETA = readFileSync(new URL('../../estilos/paleta.css', import.meta.url), 'utf8')

type Ventana = {
  PT_TEMA?: string
  PT_TEMAS?: string[]
  PT_PRIMITIVAS?: string[]
  ptLeerTema?: () => string
  ptAplicarTema?: (t: string) => void
  ptGuardarValores?: (v: Record<string, string> | null) => void
  addEventListener: (tipo: string, fn: (e: { key: string | null }) => void) => void
}

function cargar(almacen: Record<string, string> = {}) {
  const propiedades = new Map<string, string>()
  const atributos: Record<string, string> = {}
  const oyentes: ((e: { key: string | null }) => void)[] = []
  const localStorage = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null),
    setItem: (k: string, v: string) => {
      almacen[k] = String(v)
    },
    removeItem: (k: string) => {
      delete almacen[k]
    },
  }
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        atributos[k] = v
      },
      style: {
        setProperty: (k: string, v: string) => propiedades.set(k, v),
        removeProperty: (k: string) => propiedades.delete(k),
      },
    },
  }
  const window: Ventana = { addEventListener: (_tipo, fn) => oyentes.push(fn) }
  runInNewContext(CODIGO, { window, document, localStorage, JSON })
  return { window, atributos, propiedades, almacen, storage: (key: string | null) => oyentes.forEach((fn) => fn({ key })) }
}

describe('tema.js', () => {
  it('sin nada guardado aplica claro y expone la lista de temas', () => {
    const { window, atributos, propiedades } = cargar()
    expect(atributos['data-theme']).toBe('claro')
    expect(window.PT_TEMA).toBe('claro')
    expect(window.PT_TEMAS).toEqual(['claro', 'calido', 'oscuro'])
    expect(propiedades.size).toBe(0)
  })

  it('aplica el tema guardado y un tema desconocido cae a claro', () => {
    expect(cargar({ pt_tema_v1: 'oscuro' }).atributos['data-theme']).toBe('oscuro')
    expect(cargar({ pt_tema_v1: 'enfasis' }).atributos['data-theme']).toBe('claro')
    expect(cargar({ pt_tema_v1: 'marfil' }).window.ptLeerTema?.()).toBe('claro')
  })

  it('con caché aplica las primitivas válidas y guarda el tema elegido', () => {
    const valores = { '--pal-acento-500': '#1D6B86', '--pal-base-50': '#fafafa' }
    const { window, propiedades, almacen, atributos } = cargar({ pt_tema_valores_v1: JSON.stringify(valores) })
    expect(propiedades.get('--pal-acento-500')).toBe('#1d6b86')
    expect(propiedades.get('--pal-base-50')).toBe('#fafafa')
    window.ptAplicarTema?.('calido')
    expect(almacen.pt_tema_v1).toBe('calido')
    expect(atributos['data-theme']).toBe('calido')
    window.ptAplicarTema?.('otro')
    expect(atributos['data-theme']).toBe('claro')
  })

  it('ignora claves fuera de la lista y valores que no son hex (inyección de CSS)', () => {
    const valores = {
      '--pal-base-50': 'red; background: url(https://x)',
      '--pal-acento-500': '#12345',
      '--pal-acento-600': '#GGGGGG',
      'background': '#000000',
      '--otra': '#000000',
      '--pal-base-900': 123,
      '--pal-base-700': '#ABCDEF',
    }
    const { propiedades } = cargar({ pt_tema_valores_v1: JSON.stringify(valores) })
    expect([...propiedades.entries()]).toEqual([['--pal-base-700', '#abcdef']])
  })

  it('una caché que no es un objeto o no es JSON se ignora sin lanzar', () => {
    expect(cargar({ pt_tema_valores_v1: '["#000000"]' }).propiedades.size).toBe(0)
    expect(cargar({ pt_tema_valores_v1: '{rota' }).propiedades.size).toBe(0)
    expect(cargar({ pt_tema_valores_v1: 'null' }).propiedades.size).toBe(0)
  })

  it('ptGuardarValores actualiza la caché y repinta; null la borra y quita las propiedades', () => {
    const { window, propiedades, almacen } = cargar()
    window.ptGuardarValores?.({ '--pal-exito': '#2D6B3C' })
    expect(JSON.parse(almacen.pt_tema_valores_v1)).toEqual({ '--pal-exito': '#2D6B3C' })
    expect(propiedades.get('--pal-exito')).toBe('#2d6b3c')
    window.ptGuardarValores?.(null)
    expect(almacen.pt_tema_valores_v1).toBeUndefined()
    expect(propiedades.size).toBe(0)
  })

  it('sigue el evento storage de las dos claves y de un borrado total', () => {
    const { atributos, propiedades, almacen, storage } = cargar()
    almacen.pt_tema_v1 = 'oscuro'
    storage('pt_tema_v1')
    expect(atributos['data-theme']).toBe('oscuro')
    almacen.pt_tema_valores_v1 = JSON.stringify({ '--pal-info': '#2A64A8' })
    storage('pt_tema_valores_v1')
    expect(propiedades.get('--pal-info')).toBe('#2a64a8')
    almacen.pt_tema_v1 = 'otra-clave'
    storage('otra')
    expect(atributos['data-theme']).toBe('oscuro')
    delete almacen.pt_tema_v1
    storage(null)
    expect(atributos['data-theme']).toBe('claro')
  })

  it('la lista PT_PRIMITIVAS coincide con las primitivas de color de paleta.css', () => {
    const { window } = cargar()
    const hexEnPaleta = [...primitivasDe(PALETA)].filter(([, v]) => /^#[0-9A-Fa-f]{6}$/.test(v)).map(([k]) => k).sort()
    expect([...(window.PT_PRIMITIVAS ?? [])].sort()).toEqual(hexEnPaleta)
  })

  it('no lleva emojis ni referencias a la marca de origen', () => {
    expect(CODIGO).not.toMatch(/ld_|LD_|--ld-/)
    expect(CODIGO).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
