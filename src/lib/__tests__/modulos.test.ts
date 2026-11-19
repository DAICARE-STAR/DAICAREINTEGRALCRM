import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MODULOS,
  NUCLEO,
  accionesDe,
  dependenciasDe,
  dependientesDe,
  estaActivo,
  moduloDeAccion,
  moduloPorSlug,
  ordenDeActivacion,
  tablasDe,
  validarActivacion,
  validarDesactivacion,
  validarLimites,
  widgetsActivos,
} from '../modulos'

const SLUGS = MODULOS.map((m) => m.slug)
const ESQUEMA = fileURLToPath(new URL('../../../supabase/esquema/', import.meta.url))
// Los traídos del portal de origen que esperan su archivo de esquema (PP-DEC-21).
// Productos ya tiene el suyo (22-catalogo.sql) y sigue planeado hasta sus pantallas
const SIN_ESQUEMA = ['calendario', 'chat', 'proyectos', 'disenos', 'manuales', 'productos', 'cotizador', 'gerencia', 'licitaciones', 'sitio-web']
const ERP = ['inventario', 'compras', 'ventas', 'facturacion', 'cartera', 'contabilidad', 'rrhh']
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
// verbo_objeto (manage_members, edit_crm) o app_<slug>
const CLAVE_PERMISO = /^(?:app_[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[a-z]+_[a-z]+(?:_[a-z]+)*)$/

const unicos = (xs: string[]) => new Set(xs).size === xs.length

describe('registro de módulos', () => {
  it('tiene slugs únicos y en kebab-case', () => {
    expect(unicos(SLUGS)).toBe(true)
    for (const s of SLUGS) expect(s).toMatch(KEBAB)
  })

  it('trae el núcleo, disponible y sin dependencias; 4 activables y planeados los 10 sin esquema y los 7 ERP', () => {
    const nucleo = moduloPorSlug(NUCLEO)
    expect(nucleo).toBeDefined()
    expect(nucleo?.estado).toBe('disponible')
    expect(nucleo?.depende).toEqual([])
    expect(MODULOS.filter((m) => m.estado === 'disponible').map((m) => m.slug)).toEqual(['nucleo', 'ia', 'correo', 'crm'])
    expect(MODULOS.filter((m) => m.estado === 'planeado').map((m) => m.slug)).toEqual([...SIN_ESQUEMA, ...ERP])
  })

  // D-1 (PP-DEC-21): un módulo activable no puede prometer un esquema que no existe
  it('todo módulo activable con sql tiene su archivo en supabase/esquema', () => {
    for (const m of MODULOS.filter((x) => x.estado === 'disponible' && x.sql)) {
      expect(existsSync(ESQUEMA + m.sql), `${m.slug}: falta supabase/esquema/${m.sql}`).toBe(true)
    }
  })

  it('productos declara sus permisos, su archivo y sus tablas, pero sigue planeado: no se activa ni se ve', () => {
    const p = moduloPorSlug('productos')!
    expect(p.estado).toBe('planeado')
    expect(p.permisos.map((x) => x.clave)).toEqual(['app_productos', 'edit_productos'])
    expect(p.sql).toBe('22-catalogo.sql')
    expect(existsSync(ESQUEMA + p.sql)).toBe(true)
    expect(p.tablas).toEqual([
      'productos', 'productos_categorias', 'productos_unidades', 'productos_conversiones',
      'productos_impuestos', 'productos_cambios', 'productos_lineas',
    ])
    expect(p.conectores).toEqual([])
    expect(validarActivacion([], 'productos').errores).toEqual(['módulo planeado, todavía sin fase: productos'])
    expect(estaActivo(['productos'], 'productos')).toBe(false)
  })

  it('las dependencias duras de un módulo activable también son activables', () => {
    for (const m of MODULOS.filter((x) => x.estado === 'disponible')) {
      for (const d of dependenciasDe(m.slug)) expect(moduloPorSlug(d)?.estado, `${m.slug} → ${d}`).toBe('disponible')
    }
  })

  // BL-01 (PP-DEC-22): duro solo el modelo que se lee; el resto en integra
  it('una pyme de servicios activa facturación sin inventario ni compras', () => {
    const duras = dependenciasDe('facturacion')
    expect(duras).toEqual(['productos', 'crm'])
    for (const d of ['inventario', 'compras', 'ventas']) expect(duras).not.toContain(d)
    expect(ordenDeActivacion([], 'facturacion')).toEqual(['productos', 'crm', 'facturacion'])
    expect(ordenDeActivacion(['crm'], 'facturacion')).toEqual(['productos', 'facturacion'])
    expect(moduloPorSlug('facturacion')?.integra).toEqual(['ventas', 'compras'])
  })

  it('los ERP planeados declaran duro solo catálogo, terceros o facturas; lo demás es blando', () => {
    const duras = Object.fromEntries(ERP.map((s) => [s, moduloPorSlug(s)?.depende]))
    expect(duras).toEqual({
      inventario: ['productos'],
      compras: ['productos', 'crm'],
      ventas: ['productos', 'crm'],
      facturacion: ['productos', 'crm'],
      cartera: ['facturacion'],
      contabilidad: [],
      rrhh: [],
    })
    // Ningún ERP exige un módulo de operación (inventario, compras, ventas)
    for (const s of ERP) for (const d of ['inventario', 'compras', 'ventas']) expect(dependenciasDe(s), `${s} → ${d}`).not.toContain(d)
    // Un mismo módulo no es a la vez duro y blando
    for (const m of MODULOS) for (const d of m.integra) expect(m.depende, `${m.slug} → ${d}`).not.toContain(d)
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
    expect(dependenciasDe('ventas')).toEqual(['productos', 'crm'])
    expect(dependenciasDe('cartera')).toEqual(['productos', 'crm', 'facturacion'])
    expect(dependenciasDe(NUCLEO)).toEqual([])
    expect(dependenciasDe('no-existe')).toEqual([])
  })

  it('dependientesDe devuelve quién depende, el más lejano primero', () => {
    const d = dependientesDe('productos')
    expect(d).toContain('cotizador')
    expect(d).toContain('inventario')
    expect(d.indexOf('cartera')).toBeLessThan(d.indexOf('facturacion'))
    expect(dependientesDe('chat')).toEqual([])
    // integra no cuenta: nadie depende de cotizador ni de inventario
    expect(dependientesDe('cotizador')).toEqual([])
    expect(dependientesDe('inventario')).toEqual([])
  })

  it('validarActivacion rechaza un módulo planeado (ERP o sin esquema) o desconocido', () => {
    expect(validarActivacion(['productos'], 'inventario').ok).toBe(false)
    expect(validarActivacion(['productos'], 'inventario').errores[0]).toMatch(/planeado/)
    expect(validarActivacion([], 'calendario').errores).toEqual(['módulo planeado, todavía sin fase: calendario'])
    expect(validarActivacion(['productos'], 'cotizador').ok).toBe(false)
    expect(validarActivacion([], 'nada').errores[0]).toMatch(/desconocido/)
    // El núcleo cuenta como activo sin figurar en la lista
    expect(validarActivacion([], 'crm').ok).toBe(true)
  })

  it('ordenDeActivacion pone las dependencias duras inactivas antes del propio y salta las activas', () => {
    expect(ordenDeActivacion([], 'cartera')).toEqual(['productos', 'crm', 'facturacion', 'cartera'])
    expect(ordenDeActivacion(['crm'], 'cartera')).toEqual(['productos', 'facturacion', 'cartera'])
    expect(ordenDeActivacion([], 'crm')).toEqual(['crm'])
    expect(ordenDeActivacion([], 'contabilidad')).toEqual(['contabilidad'])
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
    expect(widgetsActivos([])).toEqual(['clock'])
    // Un planeado no aporta widgets aunque su fila figure activa
    expect(widgetsActivos(['calendario', 'gerencia', 'crm'])).toEqual(['clock'])
  })

  it('estaActivo: el núcleo siempre; un planeado o desconocido nunca, aunque su fila figure activa', () => {
    expect(estaActivo([], NUCLEO)).toBe(true)
    expect(estaActivo(['crm'], 'crm')).toBe(true)
    expect(estaActivo([], 'crm')).toBe(false)
    expect(estaActivo(['chat'], 'chat')).toBe(false)
    expect(estaActivo(['viejo'], 'viejo')).toBe(false)
  })

  it('accionesDe, moduloDeAccion y tablasDe', () => {
    expect(accionesDe('calendario')).toContain('create-event')
    expect(moduloDeAccion('create-event')).toBe('calendario')
    expect(moduloDeAccion('list-contacts')).toBeUndefined()
    expect(tablasDe('crm')).toContain('crm_salud')
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
