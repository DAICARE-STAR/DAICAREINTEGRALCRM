import { describe, expect, it, vi } from 'vitest'
import { botonesConNombre, maxUnaPrimaria, renderEstatico, sinEmojis, unH1 } from '../../../test/render'
import { ImpuestosVista } from '../admin/ImpuestosProductos'
import { FILTROS_VACIOS } from '../lib/filtros'
import type { Catalogos, Producto } from '../lib/tipos'
import { CatalogosVista } from '../paginas/Catalogos'
import { DatosProducto, FichaProductoVista, HistorialVista } from '../paginas/FichaProducto'
import { ImportarVista } from '../paginas/Importar'
import { ProductosVista } from '../paginas/Productos'
import { UnidadesVista } from '../paginas/UnidadesProducto'

vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (n: unknown) => n }))
vi.stubGlobal('document', { body: {} })

const CAT: Catalogos = {
  categorias: [{ id: 'c1', nombre: 'Herramientas', padre_id: null, orden: 0, archivado_en: null }],
  unidades: [
    { clave: 'und', nombre: 'Unidad', simbolo: null, decimales: 0, sistema: true, archivado_en: null },
    { clave: 'caja', nombre: 'Caja', simbolo: null, decimales: 0, sistema: false, archivado_en: null },
  ],
  impuestos: [{ clave: 'iva_general', nombre: 'IVA general', tipo: 'iva', tratamiento: 'gravado', porcentaje: 19, predeterminado: true, archivado_en: null }],
}
const producto: Producto = {
  id: '00000000-0000-0000-0000-000000000001', codigo: 'A-100', nombre: 'Producto de prueba', descripcion: null, tipo: 'bien',
  vendible: true, comprable: true, categoria_id: 'c1', unidad_base: 'und', impuesto: 'iva_general', precio_lista: 10000,
  precio_lista_moneda: 'COP', archivado_en: null, created_by: null, updated_by: null, created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z',
}
const nada = () => {}
const reglas = (html: string, h1 = true) => {
  if (h1) unH1(html)
  maxUnaPrimaria(html)
  sinEmojis(html)
  botonesConNombre(html)
}

describe('Productos: lista (render estático)', () => {
  const props = {
    total: 1, filtros: FILTROS_VACIOS, busqueda: '', catalogos: CAT, alBuscar: nada, alFiltrar: nada, alLimpiar: nada,
    alReintentar: nada, alNuevo: nada, alImportar: nada, alExportar: nada, alCargarMas: nada,
  }

  it('con edit_productos: Nuevo producto, Importar y Exportar; tabla y tarjetas', () => {
    const html = renderEstatico(<ProductosVista {...props} productos={[producto]} puedeEditar />)
    reglas(html)
    expect(html).toContain('Nuevo producto')
    expect(html).toContain('Importar')
    expect(html).toContain('Exportar')
    expect(html).toContain('prod-tabla')
    expect(html).toContain('prod-tarjetas')
    expect(html).toContain('COP $ 10.000')
    expect(html).toContain('Herramientas')
  })

  it('solo app_productos: ve y exporta, sin Nuevo producto ni Importar', () => {
    const html = renderEstatico(<ProductosVista {...props} productos={[producto]} puedeEditar={false} />)
    reglas(html)
    expect(html).not.toContain('Nuevo producto')
    expect(html).not.toContain('Importar')
    expect(html).toContain('Exportar')
    expect(html).not.toMatch(/btn-primary/)
  })

  it('cargando, vacío sin filtros, vacío con filtros y error', () => {
    const cargando = renderEstatico(<ProductosVista {...props} productos={null} puedeEditar />)
    reglas(cargando)
    expect(cargando).toContain('skel')
    const vacio = renderEstatico(<ProductosVista {...props} total={0} productos={[]} puedeEditar />)
    reglas(vacio)
    expect(vacio).toContain('Todavía no hay productos.')
    const vacioLectura = renderEstatico(<ProductosVista {...props} total={0} productos={[]} puedeEditar={false} />)
    expect(vacioLectura).not.toContain('Nuevo producto')
    const filtrado = renderEstatico(<ProductosVista {...props} total={0} productos={[]} filtros={{ ...FILTROS_VACIOS, tipo: 'servicio' }} puedeEditar />)
    expect(filtrado).toContain('Quitar filtros')
    const error = renderEstatico(<ProductosVista {...props} total={0} productos={[]} error="No se pudo completar la operación." puedeEditar />)
    expect(error).toContain('Reintentar')
  })

  it('sin catálogos: Nuevo producto, Importar y Exportar deshabilitados; su error en lugar de la lista', () => {
    const html = renderEstatico(<ProductosVista {...props} productos={[producto]} puedeEditar sinCatalogos errorCatalogos="Sin conexión." />)
    reglas(html)
    expect(html).toMatch(/disabled=""[^>]*>Importar</)
    expect(html).toMatch(/disabled=""[^>]*>Exportar</)
    expect(html).toMatch(/disabled=""[^>]*>Nuevo producto</)
    expect(html).toContain('Sin conexión.')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('prod-tabla')
    const sinMoneda = renderEstatico(<ProductosVista {...props} productos={[producto]} puedeEditar sinMoneda />)
    expect(sinMoneda).toMatch(/disabled=""[^>]*>Importar</)
    expect(sinMoneda).not.toMatch(/disabled=""[^>]*>Exportar</)
  })
})

describe('Productos: ficha (render estático)', () => {
  const base = { producto, activa: 'datos' as const, alCambiar: nada, alEditar: nada, alArchivar: nada, alBorrar: nada }

  it('Borrar solo administrador; Editar y Archivar con edit_productos', () => {
    const admin = renderEstatico(
      <FichaProductoVista {...base} puedeEditar esAdmin>
        <DatosProducto producto={producto} catalogos={CAT} />
      </FichaProductoVista>,
    )
    reglas(admin)
    expect(admin).toContain('Borrar')
    expect(admin).toContain('Editar')
    expect(admin).toContain('Archivar')
    expect(admin).toContain('IVA general · 19 %')
    const editor = renderEstatico(<FichaProductoVista {...base} puedeEditar esAdmin={false} />)
    reglas(editor)
    expect(editor).not.toContain('Borrar')
    const lectura = renderEstatico(<FichaProductoVista {...base} puedeEditar={false} esAdmin={false} />)
    reglas(lectura)
    expect(lectura).not.toMatch(/>Editar<|>Archivar<|>Borrar</)
    expect(lectura).toMatch(/role="tab"[^>]*>Unidades</)
    expect(lectura).toMatch(/role="tab"[^>]*>Historial</)
  })

  it('unidades: «1 caja = 12 und» y acciones solo con edit_productos', () => {
    const conv = [{ producto_id: producto.id, unidad: 'caja', factor: '12.000000' }]
    const html = renderEstatico(<UnidadesVista producto={producto} conversiones={conv} catalogos={CAT} puedeEditar alNueva={nada} alCambiar={nada} alQuitar={nada} />)
    reglas(html, false)
    expect(html).toContain('1 caja = 12 und')
    expect(html).toContain('Añadir unidad alterna')
    const lectura = renderEstatico(<UnidadesVista producto={producto} conversiones={conv} catalogos={CAT} puedeEditar={false} alNueva={nada} alCambiar={nada} alQuitar={nada} />)
    expect(lectura).not.toContain('Quitar')
  })

  it('unidades con error de lectura: la causa y Reintentar, no «Solo se cuenta en» ni Añadir', () => {
    const html = renderEstatico(
      <UnidadesVista producto={producto} conversiones={[]} error="Sin conexión." catalogos={CAT} puedeEditar alNueva={nada} alCambiar={nada} alQuitar={nada} alReintentar={nada} />,
    )
    reglas(html, false)
    expect(html).toContain('Sin conexión.')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Solo se cuenta en')
    expect(html).not.toContain('Añadir unidad alterna')
  })

  it('Editar deshabilitado mientras faltan los catálogos', () => {
    expect(renderEstatico(<FichaProductoVista {...base} puedeEditar esAdmin={false} sinCatalogos />)).toMatch(/disabled=""[^>]*>Editar</)
  })

  it('historial vacío y con cambios', () => {
    expect(renderEstatico(<HistorialVista lista={[]} catalogos={CAT} moneda="COP" personas={[]} />)).toContain('Sin cambios registrados.')
    const html = renderEstatico(
      <HistorialVista
        lista={[{ id: 1, entidad: 'producto', entidad_id: producto.id, operacion: 'update', campos: ['precio_lista'], antes: { precio_lista: 10000 }, despues: { precio_lista: 12000 }, autor_id: 'u1', created_at: '2026-11-19T15:00:00Z' }]}
        catalogos={CAT}
        moneda="COP"
        personas={[{ id: 'u1', nombre: 'Persona de prueba' }]}
      />,
    )
    expect(html).toContain('Precio de lista: COP $ 10.000 → COP $ 12.000')
    expect(html).toContain('Persona de prueba')
    expect(html).not.toContain('Cargar más')
  })

  it('historial con más cambios de los leídos y personas sin leer', () => {
    const html = renderEstatico(
      <HistorialVista
        lista={[{ id: 1, entidad: 'producto', entidad_id: producto.id, operacion: 'insert', campos: [], antes: null, despues: null, autor_id: 'u1', created_at: '2026-11-19T15:00:00Z' }]}
        catalogos={CAT}
        moneda="COP"
        personas={[]}
        errorPersonas="Sin conexión."
        hayMas
        alCargarMas={nada}
      />,
    )
    reglas(html, false)
    expect(html).toContain('Cargar más')
    expect(html).toContain('Sin conexión.')
  })
})

describe('Productos: catálogos e impuestos (render estático)', () => {
  const props = {
    catalogos: CAT, cargados: true, error: null, alCambiar: nada, alNuevaCategoria: nada, alEditarCategoria: nada,
    alArchivarCategoria: nada, alNuevaUnidad: nada, alEditarUnidad: nada, alArchivarUnidad: nada,
  }

  it('categorías y unidades: editar solo con edit_productos; und no se archiva', () => {
    const cat = renderEstatico(<CatalogosVista {...props} activa="categorias" puedeEditar />)
    reglas(cat)
    expect(cat).toContain('Nueva categoría')
    expect(cat).toContain('Nueva subcategoría')
    const uni = renderEstatico(<CatalogosVista {...props} activa="unidades" puedeEditar />)
    reglas(uni)
    expect(uni).toContain('Nueva unidad')
    expect((uni.match(/>Archivar</g) ?? []).length).toBe(1)
    const lectura = renderEstatico(<CatalogosVista {...props} activa="categorias" puedeEditar={false} />)
    reglas(lectura)
    expect(lectura).not.toMatch(/Nueva categoría|Archivar|btn-primary/)
  })

  it('clases de impuesto: la predeterminada no se archiva ni se vuelve a marcar', () => {
    const html = renderEstatico(<ImpuestosVista clases={CAT.impuestos} error={null} alNueva={nada} alEditar={nada} alPredeterminar={nada} alArchivar={nada} />)
    reglas(html, false)
    expect(html).toContain('Nueva clase')
    expect(html).not.toContain('Marcar como predeterminada')
    expect(html).not.toContain('Archivar')
  })
})

describe('Productos: importar (render estático)', () => {
  const props = {
    separador: ',' as const, catalogos: CAT, creando: false, alSeparador: nada, alArchivo: nada, alPlantilla: nada,
    alCrearCategorias: nada, alEscribir: nada, alCancelar: nada, alReporte: nada, alCerrar: nada,
  }

  it('archivo: separador decimal, archivo y plantilla', () => {
    const html = renderEstatico(<ImportarVista {...props} estado={{ fase: 'archivo', error: null, leyendo: false }} />)
    reglas(html, false)
    expect(html).toContain('type="file"')
    expect(html).toContain('Separador decimal')
    expect(html).toContain('Descargar plantilla')
  })

  it('vista previa: conteos, categorías nuevas, códigos normalizados y unidades alternas', () => {
    const mapeo = {
      error: null,
      omitidas: 1,
      categoriasNuevas: ['Insumos / Tornillería'],
      filas: [
        { fila: 2, codigoOriginal: 'ab 12', codigo: 'AB12', nombre: 'X', conversiones: [{ unidad: 'caja', factor: '12' }], unidadBase: 'und', errores: [], datos: { fila: 2 } },
        { fila: 3, codigoOriginal: null, codigo: null, nombre: 'Y', conversiones: null, unidadBase: null, errores: ['Categoría que no existe: Insumos / Tornillería'], datos: { fila: 3 } },
      ],
    }
    const previa = [
      { fila: 2, accion: 'crear' as const, codigo: 'AB12', errores: [] },
      { fila: 3, accion: 'error' as const, codigo: null, errores: ['Categoría que no existe: Insumos / Tornillería'] },
    ]
    const html = renderEstatico(<ImportarVista {...props} estado={{ fase: 'vista', mapeo, previa }} />)
    reglas(html, false)
    expect(html).toContain('Crear: 1')
    expect(html).toContain('Crear estas categorías')
    expect(html).toContain('Fila 2: ab 12 → AB12')
    expect(html).toContain('Fila 2: 1 caja = 12 und')
    expect(html).toContain('Importar 1 productos')
  })
})
