// Widgets que el Inicio sabe pintar, con su nombre, su grupo en el menú
// «Widgets» y si ocupan todo el ancho de la grilla. Vive aparte del
// Dashboard para que Administración → Widgets oculte las filas de
// portal_widgets sin widget sin cargar el Inicio en su chunk.
//
// En 1.10 (Hick) salen 'proyectos' («Proyectos recientes», se solapaba con
// Mis pendientes y Fechas) y 'ponderado' (ahora va dentro de Pipeline); en
// 1.11 sale 'conversion' (la conversión queda solo en Gerencia). Un id que
// ya no está aquí se ignora aunque su fila siga activa en portal_widgets o
// guardada en la preferencia personal: nadie ve una tarjeta rota.
// Referencia (hora mundial y TRM) va primero: es el contexto del día.
export const GRUPOS = ['Referencia', 'Mi trabajo', 'Comercial', 'Sitio web'] as const

interface DefWidget {
  id: string
  label: string
  grupo: (typeof GRUPOS)[number]
  ancho?: boolean
}

// En el producto, el núcleo trae solo la hora mundial; los widgets de cada
// módulo llegan con su módulo (docs/origen.md, portes de módulo).
export const WIDGETS = [
  { id: 'clock', label: 'Hora mundial', grupo: 'Referencia' },
] as const satisfies readonly DefWidget[]

export type WidgetId = (typeof WIDGETS)[number]['id']

const WIDGET_IDS = WIDGETS.map((w) => w.id) as readonly WidgetId[]

export function esWidgetId(id: string): id is WidgetId {
  return (WIDGET_IDS as readonly string[]).includes(id)
}

/** Definición de un widget del catálogo (grupo y ancho). */
export function defWidget(id: WidgetId): DefWidget {
  return WIDGETS.find((w) => w.id === id) as DefWidget
}
