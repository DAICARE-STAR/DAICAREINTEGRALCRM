import { describe, expect, it } from 'vitest'
import { SLUG_PATTERN, toolPermKey } from '../data'
import { ICONOS_LINEA, LOGO_DE_PAR, resolverIcono, tieneIconoPropio, type Forma } from '../iconos-apps'

const APPS = ['sitio-web', 'proyectos', 'cotizador', 'licitaciones', 'directorio', 'productos', 'gerencia', 'manuales', 'disenos']

// Nombres tal como están en Administración → Herramientas (2026-10-27)
const HERRAMIENTAS = [
  'Titan Mail',
  'Correo THREELINE',
  'Portal Facturación',
  'CRM AEC',
  'Workspace AEC',
  'ReluxNet',
  'Envia',
  'SPB',
  'EMCALI',
  'EPM PROVEEDORES',
  'LATAMCOMPRA',
  'LICITALAB - PERU',
]

function numeros(f: Forma): number[] {
  if (f.t === 'path') return (f.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  if (f.t === 'circle') return [f.cx, f.cy, f.r]
  return [f.x, f.y, f.width, f.height, f.rx ?? 0]
}

describe('ICONOS_LINEA', () => {
  it('cubre las apps y las herramientas propias', () => {
    for (const slug of APPS) expect(ICONOS_LINEA[slug], slug).toBeDefined()
    for (const nombre of HERRAMIENTAS) expect(ICONOS_LINEA[toolPermKey(nombre)], nombre).toBeDefined()
    expect(Object.keys(ICONOS_LINEA)).toHaveLength(APPS.length + HERRAMIENTAS.length)
  })

  it('cumple las reglas del juego', () => {
    for (const [clave, formas] of Object.entries(ICONOS_LINEA)) {
      expect(formas.length, clave).toBeGreaterThan(0)
      expect(formas.length, clave).toBeLessThanOrEqual(3)
      for (const f of formas) {
        for (const n of numeros(f)) {
          expect(Math.round(n * 10) / 10, `${clave}: ${n}`).toBe(n)
        }
        // Con trazo 2, la tinta de círculos y rectángulos queda entre 2 y 22
        if (f.t === 'circle') {
          expect(f.cx - f.r, clave).toBeGreaterThanOrEqual(3)
          expect(f.cx + f.r, clave).toBeLessThanOrEqual(21)
          expect(f.cy - f.r, clave).toBeGreaterThanOrEqual(3)
          expect(f.cy + f.r, clave).toBeLessThanOrEqual(21)
        }
        if (f.t === 'rect') {
          expect(f.x, clave).toBeGreaterThanOrEqual(3)
          expect(f.y, clave).toBeGreaterThanOrEqual(3)
          expect(f.x + f.width, clave).toBeLessThanOrEqual(21)
          expect(f.y + f.height, clave).toBeLessThanOrEqual(21)
        }
      }
    }
  })
})

describe('resolverIcono', () => {
  it('el icono propio manda sobre el campo Icono', () => {
    expect(resolverIcono('directorio', '/icons/directorio.svg').tipo).toBe('linea')
    expect(resolverIcono(toolPermKey('Envia'), '/icons/envia.svg').tipo).toBe('linea')
  })

  it('sin icono propio usa la imagen del campo', () => {
    expect(resolverIcono(toolPermKey('Google Drive'), '/icons/google-drive.svg')).toEqual({
      tipo: 'imagen',
      src: '/icons/google-drive.svg',
    })
    expect(resolverIcono(undefined, 'https://x.test/a.svg')).toEqual({ tipo: 'imagen', src: 'https://x.test/a.svg' })
  })

  it('los accesos de una marca toman el logo de su par', () => {
    expect(resolverIcono(toolPermKey('DHL Express'), null)).toEqual({ tipo: 'imagen', src: LOGO_DE_PAR.herr_dhl_express })
    expect(resolverIcono(toolPermKey('UPS Acceso'), '📦')).toEqual({ tipo: 'imagen', src: '/icons/ups.svg' })
    expect(resolverIcono(toolPermKey('UPS Acceso'), '/icons/otro.svg')).toEqual({ tipo: 'imagen', src: '/icons/otro.svg' })
  })

  it('no confunde claves heredadas de Object.prototype con iconos', () => {
    const heredadas = Object.getOwnPropertyNames(Object.prototype)
      .map((n) => n.toLowerCase())
      .filter((n) => SLUG_PATTERN.test(n))
    for (const n of [...heredadas, 'constructor', 'tostring', 'valueOf']) {
      expect(resolverIcono(n, null), n).toEqual({ tipo: 'anillos' })
      expect(resolverIcono(n, '/x.svg'), n).toEqual({ tipo: 'imagen', src: '/x.svg' })
      expect(resolverIcono('herr_' + n, null), n).toEqual({ tipo: 'anillos' })
      expect(tieneIconoPropio(n), n).toBe(false)
    }
    expect(resolverIcono('constructor', null)).toEqual({ tipo: 'anillos' })
    expect(tieneIconoPropio('proyectos')).toBe(true)
    expect(tieneIconoPropio(toolPermKey('Envia'))).toBe(true)
    expect(tieneIconoPropio(toolPermKey('Google Drive'))).toBe(false)
  })

  it('sin nada utilizable cae a los anillos', () => {
    expect(resolverIcono('app-nueva', '🧪')).toEqual({ tipo: 'anillos' })
    expect(resolverIcono(null, null)).toEqual({ tipo: 'anillos' })
    expect(resolverIcono(undefined, '  ')).toEqual({ tipo: 'anillos' })
  })
})
