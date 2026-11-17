import { describe, expect, it, vi } from 'vitest'
import { botonesConNombre, maxUnaPrimaria, renderEstatico, sinEmojis, unH1 } from '../../../test/render'
import { AJUSTES_POR_DEFECTO } from '../lib/catalogos'
import { FILTROS_VACIOS } from '../lib/filtros'
import type { Cuenta } from '../lib/tipos'
import { CuentasVista } from '../paginas/Cuentas'
import { DatosCuenta, FichaCuentaVista } from '../paginas/FichaCuenta'
import { ImportarVista } from '../paginas/Importar'
import { SaludVista } from '../paginas/Salud'

vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (n: unknown) => n }))
vi.stubGlobal('document', { body: {} })

const cuenta: Cuenta = {
  id: '00000000-0000-0000-0000-000000000001', tipo: 'persona', nombre: 'María Pérez', documento: '1020304050',
  etapa: 'activo', origen: 'referido', tipo_empresa: null, responsable_id: null, telefono: '+57 300 123 4567',
  email: 'maria@ejemplo.com', direccion: null, ciudad: 'Bogotá', pais: 'CO', etiquetas: ['vip'], campos: {},
  notas: null, archivado_en: null, created_by: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
}
const nada = () => {}
const reglas = (html: string, h1 = true) => {
  if (h1) unH1(html)
  maxUnaPrimaria(html)
  sinEmojis(html)
  botonesConNombre(html)
}

describe('CRM: Cuentas (render estático)', () => {
  const props = {
    total: 1, filtros: FILTROS_VACIOS, busqueda: '', ajustes: AJUSTES_POR_DEFECTO, responsables: [],
    conteo: { activo: 1 }, alBuscar: nada, alFiltrar: nada, alLimpiar: nada, alNueva: nada, alImportar: nada,
    alExportar: nada, alCargarMas: nada, puedeExportar: true,
  }

  it('con datos y edit_crm: tabla, tarjetas y una sola primaria', () => {
    const html = renderEstatico(<CuentasVista {...props} cuentas={[cuenta]} puedeEditar />)
    reglas(html)
    expect(html).toContain('Nueva cuenta')
    expect(html).toContain('crm-tabla')
    expect(html).toContain('crm-tarjetas')
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Activo/)
  })

  it('sin edit_crm no hay Nueva cuenta ni Importar', () => {
    const html = renderEstatico(<CuentasVista {...props} cuentas={[cuenta]} puedeEditar={false} />)
    reglas(html)
    expect(html).not.toContain('Nueva cuenta')
    expect(html).not.toContain('Importar')
    expect(html).not.toMatch(/btn-primary/)
  })

  it('Exportar solo con exportar_crm', () => {
    expect(renderEstatico(<CuentasVista {...props} cuentas={[cuenta]} puedeEditar={false} />)).toContain('Exportar')
    const sin = renderEstatico(<CuentasVista {...props} cuentas={[cuenta]} puedeEditar puedeExportar={false} />)
    reglas(sin)
    expect(sin).not.toContain('Exportar')
    expect(sin).toContain('Importar')
  })

  it('cargando (null) y vacío ([])', () => {
    const cargando = renderEstatico(<CuentasVista {...props} cuentas={null} puedeEditar />)
    reglas(cargando)
    expect(cargando).toContain('skel')
    const vacio = renderEstatico(<CuentasVista {...props} total={0} cuentas={[]} puedeEditar />)
    reglas(vacio)
    expect(vacio).toContain('estado-vacio')
  })
})

describe('CRM: FichaCuenta (render estático)', () => {
  const base = { cuenta, activa: 'datos' as const, puedeEditar: true, esAdmin: true, alCambiar: nada, alEditar: nada, alArchivar: nada, alBorrar: nada }

  it('sin ver_salud: no aparece la pestaña Salud, sí Consentimientos', () => {
    const html = renderEstatico(
      <FichaCuentaVista {...base} verSalud={false}>
        <DatosCuenta cuenta={cuenta} ajustes={AJUSTES_POR_DEFECTO} defs={[]} responsables={[]} />
      </FichaCuentaVista>,
    )
    reglas(html)
    expect(html).not.toMatch(/role="tab"[^>]*>Salud</)
    expect(html).toMatch(/role="tab"[^>]*>Consentimientos</)
  })

  it('una empresa no tiene Salud ni Consentimientos aunque haya permiso', () => {
    const html = renderEstatico(<FichaCuentaVista {...base} cuenta={{ ...cuenta, tipo: 'empresa' }} verSalud />)
    reglas(html)
    expect(html).not.toMatch(/>Salud</)
    expect(html).not.toMatch(/>Consentimientos</)
  })

  const salud = { puedeEditar: true, vigente: true, error: null, alActivarMfa: nada, alGuardar: nada, alRegistrarConsentimiento: nada }

  it('con ver_salud y sin aal2: estado vacío con Activar segundo factor, sin datos', () => {
    const html = renderEstatico(
      <FichaCuentaVista {...base} verSalud activa="salud">
        <SaludVista {...salud} aal2={false} datos={null} />
      </FichaCuentaVista>,
    )
    reglas(html)
    expect(html).toMatch(/role="tab"[^>]*>Salud</)
    expect(html).toContain('Activar segundo factor')
    expect(html).not.toContain('<textarea')
  })

  const datos = { diagnosticos: 'Dx', medicamentos: '', alergias: 'polen', antecedentes: '', observaciones: '' }

  it('con aal2, edit_salud y consentimiento: formulario con Guardar', () => {
    const html = renderEstatico(
      <FichaCuentaVista {...base} verSalud activa="salud">
        <SaludVista {...salud} aal2 datos={datos} />
      </FichaCuentaVista>,
    )
    reglas(html)
    expect(html).toContain('<textarea')
    expect(html).toContain('polen')
  })

  it('con aal2 sin consentimiento: Registrar consentimiento en lugar del formulario', () => {
    const html = renderEstatico(<SaludVista {...salud} aal2 vigente={false} datos={datos} />)
    reglas(html, false)
    expect(html).toContain('Registrar consentimiento')
    expect(html).not.toContain('<textarea')
  })
})

describe('CRM: Importar (render estático)', () => {
  it('elegir archivo', () => {
    const html = renderEstatico(
      <ImportarVista estado={{ fase: 'archivo', error: null, leyendo: false }} alArchivo={nada} alEscribir={nada} alCancelar={nada} alReporte={nada} alCerrar={nada} />,
    )
    reglas(html, false)
    expect(html).toContain('type="file"')
  })

  it('vista previa con conteos y errores por fila', () => {
    const html = renderEstatico(
      <ImportarVista
        estado={{
          fase: 'vista',
          resultado: {
            error: null,
            omitidas: 1,
            filas: [
              { fila: 2, accion: 'crear', datos: {} as never },
              { fila: 3, accion: 'error', errores: ['Falta el nombre'] },
            ],
          },
        }}
        alArchivo={nada}
        alEscribir={nada}
        alCancelar={nada}
        alReporte={nada}
        alCerrar={nada}
      />,
    )
    reglas(html, false)
    expect(html).toContain('Crear: 1')
    expect(html).toContain('Fila 3: Falta el nombre')
    expect(html).toContain('Importar 1 cuentas')
  })
})
