import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS, aParametros, aParametrosRpc, desdeParametros, filtrosActivos } from '../filtros'

describe('filtros del CRM', () => {
  it('ida y vuelta con URLSearchParams', () => {
    const f = { q: 'pérez', tipo: 'persona' as const, etapa: 'activo', origen: '', responsable: 'u1', etiqueta: 'vip', archivadas: true }
    const p = new URLSearchParams(aParametros(f).toString())
    expect(desdeParametros(p)).toEqual(f)
    expect(aParametros(FILTROS_VACIOS).toString()).toBe('')
  })

  it('ignora un tipo no válido', () => {
    expect(desdeParametros(new URLSearchParams('tipo=otro')).tipo).toBe('')
  })

  it('cuenta los filtros activos', () => {
    expect(filtrosActivos(FILTROS_VACIOS)).toBe(0)
    expect(filtrosActivos({ ...FILTROS_VACIOS, q: '  ', etapa: 'activo', archivadas: true })).toBe(2)
  })

  it('parámetros de la RPC', () => {
    const p = aParametrosRpc({ ...FILTROS_VACIOS, q: '  ana ' }, -5, 1000)
    expect(p).toEqual({
      p_q: 'ana', p_tipo: null, p_etapa: null, p_origen: null, p_responsable: null, p_etiqueta: null,
      p_archivadas: false, p_limite: 200, p_desde: 0,
    })
    expect(aParametrosRpc(FILTROS_VACIOS, 0, 0).p_limite).toBe(1)
  })
})
