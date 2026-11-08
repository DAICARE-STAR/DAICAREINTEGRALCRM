import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ICONOS_LINEA } from '../iconos-apps'
import { MODULOS, NUCLEO, gruposPermisos } from '../modulos'
import { PERMISSIONS } from '../../types'

const DIR = join(__dirname, '..', '..', 'modulos')
const carpetas = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

describe('rutas de los módulos', () => {
  it('cada rutas.tsx corresponde a un módulo del registro con ruta', () => {
    for (const slug of carpetas) {
      const m = MODULOS.find((x) => x.slug === slug)
      expect(m, slug).toBeDefined()
      expect(m!.ruta, slug).not.toBeNull()
      expect(existsSync(join(DIR, slug, 'rutas.tsx')), slug).toBe(true)
    }
  })

  // Viceversa: los módulos llegan con su fase; uno con carpeta trae rutas.tsx
  // (arriba) y uno con ruta sin carpeta queda en «Módulo no disponible»
  it('ningún módulo planeado trae pantalla todavía', () => {
    for (const m of MODULOS.filter((x) => x.estado === 'planeado')) expect(carpetas, m.slug).not.toContain(m.slug)
  })

  it('cada módulo disponible con pantalla tiene su icono en ICONOS_LINEA', () => {
    for (const m of MODULOS.filter((x) => x.estado === 'disponible' && x.ruta && x.slug !== NUCLEO)) {
      expect(Object.prototype.hasOwnProperty.call(ICONOS_LINEA, m.icono), m.slug).toBe(true)
    }
  })

  it('cada permiso del registro aparece en la matriz con todos los módulos activos', () => {
    const activos = MODULOS.filter((m) => m.estado === 'disponible').map((m) => m.slug)
    const columnas = gruposPermisos(activos, PERMISSIONS.map((p) => p.key)).flatMap((g) => g.keys)
    for (const m of MODULOS.filter((x) => x.estado === 'disponible')) {
      for (const p of m.permisos) expect(columnas, `${m.slug}: ${p.clave}`).toContain(p.clave)
    }
    expect(new Set(columnas).size).toBe(columnas.length)
  })

  it('un módulo inactivo no aporta columnas', () => {
    const columnas = gruposPermisos([], PERMISSIONS.map((p) => p.key)).flatMap((g) => g.keys)
    expect(columnas).not.toContain('app_calendario')
    expect(columnas).toContain('manage_members')
  })
})
