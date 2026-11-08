import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MODULOS,
  NUCLEO,
  accionesDe,
  dependenciasDe,
  dependientesDe,
  moduloDeAccion,
  moduloPorSlug,
  tablasDe,
  validarActivacion,
  validarDesactivacion,
  validarLimites,
  widgetsActivos,
} from '../modulos'

const SLUGS = MODULOS.map((m) => m.slug)
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
// verbo_objeto (manage_members, edit_crm) o app_<slug>
const CLAVE_PERMISO = /^(?:app_[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[a-z]+_[a-z]+(?:_[a-z]+)*)$/

const unicos = (xs: string[]) => new Set(xs).size === xs.length

describe('registro de módulos', () => {
  it('tiene slugs únicos y en kebab-case', () => {
    expect(unicos(SLUGS)).toBe(true)
    for (const s of SLUGS) expect(s).toMatch(KEBAB)
  })

  it('trae el núcleo, disponible y sin dependencias, y los 14 módulos del portal más los 7 ERP planeados', () => {
    const nucleo = moduloPorSlug(NUCLEO)
    expect(nucleo).toBeDefined()
    expect(nucleo?.estado).toBe('disponible')
    expect(nucleo?.depende).toEqual([])
    expect(MODULOS.filter((m) => m.estado === 'disponible')).toHaveLength(14)
    expect(MODULOS.filter((m) => m.estado === 'planeado').map((m) => m.slug)).toEqual([
      'inventario', 'compras', 'ventas', 'facturacion', 'cartera', 'contabilidad', 'rrhh',
    ])
  })

  it('depende e integra apuntan a módulos existentes y nunca al propio', () => {
    for (const m of MODULOS) {
      for (const d of [...m.depende, ...m.integra]) {
        expect(SLUGS, `${m.slug} → ${d}`).toContain(d)
        expect(d).not.toBe(m.slug)
      }
    }
  })

  it('no hay ciclos en depende', () => {
    const visitando = new Set<string>()
    const listos = new Set<string>()
    const visitar = (s: string): void => {
      if (listos.has(s)) return
      expect(visitando.has(s), `ciclo en ${s}`).toBe(false)
      visitando.add(s)
      for (const d of moduloPorSlug(s)?.depende ?? []) visitar(d)
      visitando.delete(s)
      listos.add(s)
    }
    for (const s of SLUGS) visitar(s)
  })

  it('cada acción, tabla y widget pertenece a un solo módulo', () => {
    expect(unicos(MODULOS.flatMap((m) => m.acciones))).toBe(true)
    expect(unicos(MODULOS.flatMap((m) => m.tablas))).toBe(true)
    expect(unicos(MODULOS.flatMap((m) => m.widgets))).toBe(true)
  })

  it('las claves de permiso tienen forma verbo_objeto o app_<slug>, son únicas y cada módulo con pantalla declara la suya', () => {
    const claves = MODULOS.flatMap((m) => m.permisos.map((p) => p.clave))
    expect(unicos(claves)).toBe(true)
    for (const c of claves) expect(c).toMatch(CLAVE_PERMISO)
    for (const m of MODULOS) {
      for (const p of m.permisos) {
        expect(p.etiqueta.trim().length).toBeGreaterThan(0)
        if (p.clave.startsWith('app_')) expect(p.clave).toBe(`app_${m.slug}`)
      }
      if (m.slug !== NUCLEO && m.ruta) expect(claves, `${m.slug} sin app_${m.slug}`).toContain(`app_${m.slug}`)
    }
  })

  it('el sql de un módulo es un archivo NN-<nombre>.sql y su ruta empieza por /', () => {
    for (const m of MODULOS) {
      if (m.sql) expect(m.sql).toMatch(/^\d{2}-[a-z-]+\.sql$/)
      if (m.ruta) expect(m.ruta).toMatch(/^\//)
    }
  })
})

describe('helpers puros', () => {
  it('dependenciasDe devuelve el cierre transitivo en orden de activación', () => {
    expect(dependenciasDe('cotizador')).toEqual(['productos'])
    expect(dependenciasDe('ventas')).toEqual(['productos', 'cotizador', 'inventario'])
    expect(dependenciasDe('contabilidad').indexOf('productos')).toBeLessThan(dependenciasDe('contabilidad').indexOf('inventario'))
    expect(dependenciasDe(NUCLEO)).toEqual([])
    expect(dependenciasDe('no-existe')).toEqual([])
  })

  it('dependientesDe devuelve quién depende, el más lejano primero', () => {
    const d = dependientesDe('productos')
    expect(d).toContain('cotizador')
    expect(d).toContain('inventario')
    expect(d.indexOf('ventas')).toBeLessThan(d.indexOf('cotizador'))
    expect(d.indexOf('contabilidad')).toBeLessThan(d.indexOf('inventario'))
    expect(dependientesDe('chat')).toEqual([])
  })

  it('validarActivacion rechaza un módulo con dependencias inactivas, uno planeado o desconocido', () => {
    expect(validarActivacion([], 'cotizador')).toEqual({ ok: false, errores: ['depende de productos, que no está activo'] })
    expect(validarActivacion(['productos'], 'cotizador').ok).toBe(true)
    expect(validarActivacion(['productos'], 'inventario').ok).toBe(false)
    expect(validarActivacion(['productos'], 'inventario').errores[0]).toMatch(/planeado/)
    expect(validarActivacion([], 'nada').errores[0]).toMatch(/desconocido/)
    // El núcleo cuenta como activo sin figurar en la lista
    expect(validarActivacion([], 'calendario').ok).toBe(true)
  })

  it('validarDesactivacion rechaza si hay dependientes activos salvo con cascada, y nunca el núcleo', () => {
    const activos = ['productos', 'cotizador', 'proyectos', 'disenos']
    const sin = validarDesactivacion(activos, 'productos')
    expect(sin.ok).toBe(false)
    expect(sin.errores[0]).toMatch(/cotizador depende de productos/)
    expect(sin.orden).toEqual([])
    expect(validarDesactivacion(activos, 'productos', true)).toEqual({ ok: true, errores: [], orden: ['cotizador', 'productos'] })
    expect(validarDesactivacion(activos, 'proyectos', true).orden).toEqual(['disenos', 'proyectos'])
    // Sin dependientes activos no hace falta cascada
    expect(validarDesactivacion(['productos'], 'productos')).toEqual({ ok: true, errores: [], orden: ['productos'] })
    expect(validarDesactivacion(activos, 'chat').orden).toEqual([])
    expect(validarDesactivacion(activos, NUCLEO).ok).toBe(false)
  })

  it('validarLimites rechaza claves no declaradas y tipos equivocados; null es «sin límite»', () => {
    expect(validarLimites(NUCLEO, { miembros: 10, almacenamiento_mb: null }).ok).toBe(true)
    expect(validarLimites(NUCLEO, { usuarios: 10 }).errores).toEqual(['límite no declarado por nucleo: usuarios'])
    expect(validarLimites(NUCLEO, { miembros: '10' }).ok).toBe(false)
    expect(validarLimites(NUCLEO, { miembros: -1 }).ok).toBe(false)
    expect(validarLimites(NUCLEO, { miembros: 2.5 }).ok).toBe(false)
    // Más allá de 2^53 − 1 (y de bigint) se rechaza: limite_modulo fallaría en cada alta
    expect(validarLimites(NUCLEO, { miembros: Number.MAX_SAFE_INTEGER }).ok).toBe(true)
    expect(validarLimites(NUCLEO, { miembros: 1e19 }).ok).toBe(false)
    expect(validarLimites(NUCLEO, { miembros: Number.MAX_VALUE }).ok).toBe(false)
    expect(validarLimites('licitaciones', { fuentes: ['secop', 'mercadopublico'] }).ok).toBe(true)
    expect(validarLimites('licitaciones', { fuentes: 'secop' }).ok).toBe(false)
    expect(validarLimites('licitaciones', { fuentes: [1] }).ok).toBe(false)
    expect(validarLimites('chat', { miembros: 1 }).ok).toBe(false)
    expect(validarLimites('nada', {}).ok).toBe(false)
    // Las claves heredadas de Object.prototype no cuentan como declaradas
    expect(validarLimites(NUCLEO, { toString: 1 }).ok).toBe(false)
  })

  it('widgetsActivos incluye siempre los del núcleo y suma los de los módulos activos', () => {
    expect(widgetsActivos([])).toEqual(['clock', 'pendientes', 'cumpleanos'])
    expect(widgetsActivos(['calendario', 'gerencia'])).toEqual(['clock', 'pendientes', 'cumpleanos', 'reuniones', 'facturacion'])
  })

  it('accionesDe, moduloDeAccion y tablasDe', () => {
    expect(accionesDe('calendario')).toContain('create-event')
    expect(moduloDeAccion('create-event')).toBe('calendario')
    expect(moduloDeAccion('list-contacts')).toBe('directorio')
    expect(moduloDeAccion('no-existe')).toBeUndefined()
    expect(tablasDe('chat')).toEqual(['chat_channels', 'chat_messages', 'member_status'])
    expect(tablasDe('nada')).toEqual([])
    // Devuelven copias: mutarlas no toca el registro
    accionesDe('calendario').pop()
    expect(accionesDe('calendario')).toContain('delete-event')
  })
})

describe('carga con Node sin flags (sintaxis borrable)', () => {
  it('node --input-type=module importa src/lib/modulos.ts y sale 0', () => {
    const ruta = pathToFileURL(fileURLToPath(new URL('../modulos.ts', import.meta.url))).href
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(ruta)}); if (m.MODULOS.length < 14) process.exit(3)`], {
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(r.status, r.stderr).toBe(0)
  }, 30_000)
})
