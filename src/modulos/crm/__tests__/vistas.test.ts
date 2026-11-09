import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO } from '../lib/catalogos'
import type { Consentimiento } from '../lib/datos'
import type { FilaImportada } from '../lib/importador'
import { consentimientoVigente, contadoresEtapa, contarImportacion, filasReporte, partirEtiquetas, pestanasCuenta } from '../lib/vistas'

const k = (p: Partial<Consentimiento>): Consentimiento => ({
  id: 'x', cuenta_id: 'c', tipo: 'datos_salud', otorgado: true, fecha: '2026-01-01', medio: 'escrito',
  version_texto: 'v1', archivo_ruta: null, registrado_por: null, revocado_en: null, created_at: '2026-01-01T00:00:00Z', ...p,
})

describe('vistas del CRM', () => {
  it('pestañas: salud y consentimientos solo en personas; salud con permiso', () => {
    expect(pestanasCuenta('empresa', true).map((p) => p.id)).toEqual(['datos', 'contactos', 'actividades', 'historial'])
    expect(pestanasCuenta('persona', false).map((p) => p.id)).toContain('consentimientos')
    expect(pestanasCuenta('persona', false).map((p) => p.id)).not.toContain('salud')
    expect(pestanasCuenta('persona', true).map((p) => p.id)).toContain('salud')
  })

  it('consentimiento vigente: el más reciente manda', () => {
    expect(consentimientoVigente([], 'datos_salud')).toBe(false)
    expect(consentimientoVigente([k({})], 'datos_salud')).toBe(true)
    expect(consentimientoVigente([k({ revocado_en: '2026-02-01T00:00:00Z' })], 'datos_salud')).toBe(false)
    expect(consentimientoVigente([k({}), k({ fecha: '2026-03-01', otorgado: false })], 'datos_salud')).toBe(false)
    expect(consentimientoVigente([k({ tipo: 'tratamiento_datos' })], 'datos_salud')).toBe(false)
    expect(
      consentimientoVigente([k({ otorgado: false, created_at: '2026-01-01T01:00:00Z' }), k({ created_at: '2026-01-01T02:00:00Z' })], 'datos_salud'),
    ).toBe(true)
  })

  it('contadores por etapa en orden y con filtro', () => {
    const c = contadoresEtapa(AJUSTES_POR_DEFECTO, { activo: 3 }, 'activo')
    expect(c.map((x) => x.label)[0]).toBe('Solicitud')
    const activo = c.find((x) => x.label === 'Activo')!
    expect(activo).toMatchObject({ n: 3, filtro: 'etapa|activo', activa: true })
  })

  it('partirEtiquetas', () => {
    expect(partirEtiquetas(' VIP, nocturno|vip ,, ')).toEqual(['vip', 'nocturno'])
  })

  it('conteo y reporte de importación', () => {
    const filas: FilaImportada[] = [
      { fila: 2, accion: 'crear', datos: {} as never },
      { fila: 3, accion: 'actualizar', id: 'a', cambios: {} },
      { fila: 4, accion: 'sin_cambio', id: 'b' },
      { fila: 5, accion: 'error', errores: ['Falta nombre', 'Etapa'] },
      { fila: 6, accion: 'crear', datos: {} as never },
    ]
    expect(contarImportacion(filas)).toEqual({ crear: 2, actualizar: 1, sin_cambio: 1, error: 1 })
    const r = filasReporte(filas, new Map([[2, null], [3, 'Ya existe']]))
    expect(r[0]).toEqual(['Fila', 'Acción', 'Resultado'])
    expect(r.slice(1).map((x) => x[2])).toEqual(['escrita', 'Ya existe', 'sin cambio', 'Falta nombre; Etapa', 'no escrita'])
  })
})
