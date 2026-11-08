import { describe, expect, it } from 'vitest'
import {
  alternar,
  leerPrefs,
  mediasSolas,
  ordenar,
  ordenarPorGrupo,
  ordenEfectivo,
  POR_DEFECTO_OCULTOS,
  reubicar,
  serializar,
} from '../widgetsPrefs'

const CONOCIDOS = ['clock', 'trm', 'radar', 'pipeline', 'pendientes', 'checklist', 'fechas', 'diseno', 'facturacion', 'leads', 'analitica']

describe('leerPrefs', () => {
  it('sin nada guardado aplica los ocultos por defecto', () => {
    expect(leerPrefs(null, null, null, CONOCIDOS)).toEqual({
      ocultos: [...POR_DEFECTO_OCULTOS],
      orden: [],
      version: 0,
    })
    expect(POR_DEFECTO_OCULTOS).not.toContain('conversion')
  })

  it('sin nada guardado la hora mundial y la TRM se ven', () => {
    const { ocultos } = leerPrefs(null, null, null, CONOCIDOS)
    expect(ocultos).not.toContain('clock')
    expect(ocultos).not.toContain('trm')
  })

  it('quien ya las ocultó las sigue viendo ocultas', () => {
    const v2 = JSON.stringify({ ocultos: ['clock', 'trm', 'facturacion', 'analitica'], orden: [] })
    expect(leerPrefs(null, v2, null, CONOCIDOS).ocultos).toEqual(['clock', 'trm', 'facturacion', 'analitica'])
  })

  it('migra v1 (mapa de ocultos) y descarta los ids retirados', () => {
    const v1 = JSON.stringify({ clock: true, conversion: true, trm: false, radar: true })
    expect(leerPrefs(null, null, v1, CONOCIDOS)).toEqual({ ocultos: ['clock', 'radar'], orden: [], version: 1 })
  })

  it('un v1 ilegible equivale a nada oculto, como antes', () => {
    expect(leerPrefs(null, null, '{roto', CONOCIDOS)).toEqual({ ocultos: [], orden: [], version: 1 })
  })

  it('v2 manda sobre v1 y avisa que su orden es por grupo', () => {
    const v2 = JSON.stringify({ ocultos: ['leads'], orden: ['fechas', 'pendientes'] })
    expect(leerPrefs(null, v2, JSON.stringify({ clock: true }), CONOCIDOS)).toEqual({
      ocultos: ['leads'],
      orden: ['fechas', 'pendientes'],
      version: 2,
    })
  })

  it('v3 manda sobre v2 y v1', () => {
    const v3 = JSON.stringify({ ocultos: [], orden: ['radar', 'clock'] })
    const v2 = JSON.stringify({ ocultos: ['leads'], orden: ['fechas'] })
    expect(leerPrefs(v3, v2, JSON.stringify({ trm: true }), CONOCIDOS)).toEqual({
      ocultos: [],
      orden: ['radar', 'clock'],
      version: 3,
    })
  })

  it('un v3 o v2 corrupto o con otra forma cae a la versión anterior o a los defectos', () => {
    expect(leerPrefs('{roto', null, null, CONOCIDOS).ocultos).toEqual([...POR_DEFECTO_OCULTOS])
    expect(leerPrefs(null, '[1,2]', null, CONOCIDOS).ocultos).toEqual([...POR_DEFECTO_OCULTOS])
    expect(leerPrefs('[1]', JSON.stringify({ ocultos: [], orden: ['radar'] }), null, CONOCIDOS)).toEqual({
      ocultos: [],
      orden: ['radar'],
      version: 2,
    })
    expect(leerPrefs(null, JSON.stringify({ ocultos: 'x' }), JSON.stringify({ trm: true }), CONOCIDOS)).toEqual({
      ocultos: ['trm'],
      orden: [],
      version: 1,
    })
  })

  it('limpia ids desconocidos y repetidos', () => {
    const v3 = JSON.stringify({ ocultos: ['conversion', 'leads', 'leads'], orden: ['x', 'radar', 3, 'radar'] })
    expect(leerPrefs(v3, null, null, CONOCIDOS)).toEqual({ ocultos: ['leads'], orden: ['radar'], version: 3 })
  })

  it('serializar ida y vuelta', () => {
    const p = { ocultos: ['trm'], orden: ['radar', 'pipeline'] }
    expect(leerPrefs(serializar(p), null, null, CONOCIDOS)).toEqual({ ...p, version: 3 })
  })
})

describe('alternar', () => {
  it('oculta y vuelve a mostrar', () => {
    const p = { ocultos: ['trm'], orden: ['radar'] }
    const q = alternar(p, 'leads')
    expect(q.ocultos).toEqual(['trm', 'leads'])
    expect(alternar(q, 'leads')).toEqual(p)
  })
})

// En el orden del administrador (sort_order de portal_widgets)
const disponibles = [
  { id: 'clock', grupo: 'Referencia' },
  { id: 'radar', grupo: 'Comercial' },
  { id: 'pipeline', grupo: 'Comercial' },
  { id: 'pendientes', grupo: 'Mi trabajo' },
  { id: 'checklist', grupo: 'Mi trabajo' },
  { id: 'fechas', grupo: 'Mi trabajo' },
  { id: 'leads', grupo: 'Sitio web' },
]

describe('ordenarPorGrupo', () => {
  it('sin orden personal: por grupo y, dentro, el orden del administrador', () => {
    expect(ordenarPorGrupo(disponibles, []).map((w) => w.id)).toEqual([
      'clock',
      'pendientes',
      'checklist',
      'fechas',
      'radar',
      'pipeline',
      'leads',
    ])
  })

  it('el orden personal (v2) manda dentro del grupo; los no movidos van detrás', () => {
    expect(ordenarPorGrupo(disponibles, ['fechas', 'pipeline']).map((w) => w.id)).toEqual([
      'clock',
      'fechas',
      'pendientes',
      'checklist',
      'pipeline',
      'radar',
      'leads',
    ])
  })

  it('no altera la lista recibida', () => {
    const copia = disponibles.map((w) => w.id)
    ordenarPorGrupo(disponibles, ['fechas'])
    expect(disponibles.map((w) => w.id)).toEqual(copia)
  })
})

describe('ordenar (global)', () => {
  it('sin orden personal es el orden por defecto', () => {
    expect(ordenar(disponibles, []).map((w) => w.id)).toEqual(
      ordenarPorGrupo(disponibles, []).map((w) => w.id)
    )
  })

  it('el orden personal cruza grupos; los que no tienen posición van al final, por grupo', () => {
    expect(ordenar(disponibles, ['leads', 'radar', 'clock']).map((w) => w.id)).toEqual([
      'leads',
      'radar',
      'clock',
      'pendientes',
      'checklist',
      'fechas',
      'pipeline',
    ])
  })

  it('ignora ids que no están disponibles (otro rol, retirado)', () => {
    expect(ordenar(disponibles, ['facturacion', 'fechas']).map((w) => w.id)[0]).toBe('fechas')
    expect(ordenar(disponibles, ['facturacion', 'fechas'])).toHaveLength(disponibles.length)
  })

  it('no altera la lista recibida', () => {
    const copia = disponibles.map((w) => w.id)
    ordenar(disponibles, ['leads'])
    expect(disponibles.map((w) => w.id)).toEqual(copia)
  })
})

describe('ordenEfectivo', () => {
  // v2 de una persona que puso Ofertas primero en Comercial y Diseños primero en Mi trabajo
  const v2 = { orden: ['diseno', 'ofertas'], version: 2 as const }
  const conRoles = [
    { id: 'clock', grupo: 'Referencia' },
    { id: 'pendientes', grupo: 'Mi trabajo' },
    { id: 'diseno', grupo: 'Mi trabajo' },
    { id: 'radar', grupo: 'Comercial' },
    { id: 'ofertas', grupo: 'Comercial' },
    { id: 'leads', grupo: 'Sitio web' },
  ]

  it('sin v3 ordena por grupo con el orden personal de v2', () => {
    expect(ordenEfectivo(conRoles, v2).map((w) => w.id)).toEqual(['clock', 'diseno', 'pendientes', 'ofertas', 'radar', 'leads'])
  })

  it('si el perfil llega tarde, los widgets con rol vuelven a su grupo, no al final', () => {
    // Primer render: sin perfil, diseno y ofertas no están disponibles
    const sinPerfil = conRoles.filter((w) => w.id !== 'diseno' && w.id !== 'ofertas')
    expect(ordenEfectivo(sinPerfil, v2).map((w) => w.id)).toEqual(['clock', 'pendientes', 'radar', 'leads'])
    // Nada se guardó: con el perfil, el orden es el de siempre
    expect(ordenEfectivo(conRoles, v2).map((w) => w.id)).toEqual(['clock', 'diseno', 'pendientes', 'ofertas', 'radar', 'leads'])
  })

  it('sin preferencia, el orden del administrador manda (lo que cambie en Administración llega)', () => {
    const adminTrmPrimero = [{ id: 'trm', grupo: 'Referencia' }, ...conRoles]
    expect(ordenEfectivo(adminTrmPrimero, { orden: [], version: 0 }).map((w) => w.id).slice(0, 2)).toEqual(['trm', 'clock'])
  })

  it('con v3 manda el orden global de la persona', () => {
    expect(ordenEfectivo(conRoles, { orden: ['leads', 'ofertas'], version: 3 }).map((w) => w.id).slice(0, 2)).toEqual(['leads', 'ofertas'])
  })
})

describe('reubicar', () => {
  // trm y diseno ocultos, en su sitio
  const efectivo = ['clock', 'trm', 'pendientes', 'diseno', 'radar', 'leads']
  const visibles = ['clock', 'pendientes', 'radar', 'leads']

  it('lleva el widget a la posición pedida entre los visibles', () => {
    expect(reubicar(efectivo, visibles, 'leads', 0)).toEqual(['leads', 'trm', 'clock', 'diseno', 'pendientes', 'radar'])
    expect(reubicar(efectivo, visibles, 'clock', 2)).toEqual(['pendientes', 'trm', 'radar', 'diseno', 'clock', 'leads'])
  })

  it('los ocultos no se mueven', () => {
    const r = reubicar(efectivo, visibles, 'radar', 0)
    expect(r[1]).toBe('trm')
    expect(r[3]).toBe('diseno')
  })

  it('acota a los extremos', () => {
    expect(reubicar(efectivo, visibles, 'pendientes', -5)).toEqual(['pendientes', 'trm', 'clock', 'diseno', 'radar', 'leads'])
    expect(reubicar(efectivo, visibles, 'pendientes', 99)).toEqual(['clock', 'trm', 'radar', 'diseno', 'leads', 'pendientes'])
  })

  it('en su mismo sitio o con un id ajeno no cambia', () => {
    expect(reubicar(efectivo, visibles, 'radar', 2)).toEqual(efectivo)
    expect(reubicar(efectivo, visibles, 'trm', 0)).toEqual(efectivo)
    expect(reubicar(efectivo, visibles, 'facturacion', 0)).toEqual(efectivo)
  })

  it('un widget que no está disponible ahora (rol, inactivo) conserva su sitio', () => {
    // «diseno» es de un rol que la persona no tiene hoy: va en efectivo, no en visibles
    const todos = ['clock', 'pendientes', 'diseno', 'radar', 'leads']
    const hoy = ['clock', 'pendientes', 'radar', 'leads']
    const guardado = reubicar(todos, hoy, 'leads', 0)
    expect(guardado).toEqual(['leads', 'clock', 'diseno', 'pendientes', 'radar'])
    // Con el rol de vuelta, Diseños aparece donde estaba y no al final
    const conRol = todos.map((id) => ({ id, grupo: id === 'leads' ? 'Sitio web' : 'Mi trabajo' }))
    expect(ordenEfectivo(conRol, { orden: guardado, version: 3 }).map((w) => w.id)).toEqual(guardado)
  })

  it('no altera las listas recibidas', () => {
    const a = [...efectivo]
    const b = [...visibles]
    reubicar(efectivo, visibles, 'leads', 0)
    expect(efectivo).toEqual(a)
    expect(visibles).toEqual(b)
  })
})

describe('mediasSolas', () => {
  const w = (id: string, ancho = false) => ({ id, ancho })

  it('la hora mundial sola antes de un ancho ocupa la fila', () => {
    // Hora mundial y TRM en el orden de Administración, sin Próximas reuniones
    expect(mediasSolas([w('trm', true), w('clock'), w('radar', true), w('pendientes'), w('fechas')])).toEqual(['clock'])
  })

  it('dos medias seguidas comparten fila', () => {
    expect(mediasSolas([w('clock'), w('reuniones'), w('radar', true)])).toEqual([])
  })

  it('la última media sola ocupa la fila', () => {
    expect(mediasSolas([w('radar', true), w('pendientes'), w('fechas'), w('leads')])).toEqual(['leads'])
  })

  it('cuenta las filas desde cada ancho', () => {
    expect(
      mediasSolas([w('clock'), w('trm', true), w('pendientes'), w('fechas'), w('diseno'), w('checklist', true), w('leads'), w('analitica')])
    ).toEqual(['clock', 'diseno'])
  })

  it('sin medias o sin tarjetas no estira nada', () => {
    expect(mediasSolas([w('trm', true), w('radar', true)])).toEqual([])
    expect(mediasSolas([])).toEqual([])
  })
})
