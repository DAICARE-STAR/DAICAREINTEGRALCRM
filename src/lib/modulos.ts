// Registro de módulos del producto: la fuente única de qué módulos existen,
// qué permisos, widgets, acciones del proxy y tablas cubre cada uno, de qué
// depende y qué límites admite. Lo leen el shell, las funciones y los scripts
// del instalador (Node 24 sin flags): por eso es TypeScript puro con sintaxis
// borrable (sin enum, sin namespace, sin imports). La parte React (rutas
// perezosas, proveedores de Ctrl+K) vive aparte, en src/modulos/<slug>/.
//
// «depende» es una dependencia dura que valida el script de módulos; «integra»
// es una integración opcional que se muestra solo si el otro módulo está activo.
// Los módulos ERP previstos (PP-DEC-13) figuran con estado 'planeado' para que
// el registro sea la fuente única desde el primer día; no se pueden activar.

export type Conector = 'crm' | 'archivos' | 'correo' | 'calendario' | 'facturacion' | 'licitaciones' | 'cambio'
export type TipoLimite = 'entero' | 'lista'
export type EstadoModulo = 'disponible' | 'planeado'

export type Permiso = {
  clave: string
  etiqueta: string
}

export type Modulo = {
  slug: string
  nombre: string
  // Clave de ICONOS_LINEA (iconos de línea del shell)
  icono: string
  // Ruta base en React, o null si el módulo es una capacidad sin pantalla
  ruta: string | null
  estado: EstadoModulo
  // Claves app_<slug> y de acción (verbo_objeto), con etiqueta para la matriz de roles
  permisos: Permiso[]
  // Claves de portal_widgets que aporta
  widgets: string[]
  // Acciones del proxy de conectores que le pertenecen
  acciones: string[]
  // Tablas que cubre la política restrictiva modulo_<slug>
  tablas: string[]
  // Archivo de esquema del módulo en supabase/esquema/, o null si no tiene
  sql: string | null
  depende: string[]
  integra: string[]
  conectores: Conector[]
  // Claves admitidas en modulos_instalacion.limites y su tipo (null = sin límite)
  limites: Record<string, TipoLimite>
  manual?: { version: number }
}

export const NUCLEO = 'nucleo'

const planeado = (slug: string, nombre: string, depende: string[], integra: string[] = [], conectores: Conector[] = []): Modulo => ({
  slug,
  nombre,
  icono: slug,
  ruta: `/${slug}`,
  estado: 'planeado',
  permisos: [{ clave: `app_${slug}`, etiqueta: `Ver ${nombre}` }],
  widgets: [],
  acciones: [],
  tablas: [],
  sql: null,
  depende,
  integra,
  conectores,
  limites: {},
})

export const MODULOS: readonly Modulo[] = [
  {
    slug: NUCLEO,
    nombre: 'Núcleo',
    icono: 'inicio',
    ruta: '/',
    estado: 'disponible',
    permisos: [
      { clave: 'manage_members', etiqueta: 'Gestionar miembros' },
      { clave: 'manage_roles', etiqueta: 'Gestionar roles y permisos' },
      { clave: 'manage_connectors', etiqueta: 'Gestionar conectores' },
      { clave: 'view_credentials', etiqueta: 'Ver credenciales compartidas' },
      { clave: 'manage_credentials', etiqueta: 'Gestionar credenciales compartidas' },
    ],
    // Solo lo que el shell sabe pintar (src/lib/widgets.ts); pendientes y
    // cumpleaños llegan cuando se porten sus widgets
    widgets: ['clock'],
    acciones: ['list-members'],
    // Siempre activo: sus tablas (00 a 09) no llevan política modulo_*
    tablas: [],
    sql: null,
    depende: [],
    integra: [],
    conectores: ['correo'],
    limites: { miembros: 'entero', almacenamiento_mb: 'entero', retencion_uso_dias: 'entero' },
  },
  {
    slug: 'ia',
    nombre: 'IA',
    icono: 'ia',
    ruta: null,
    estado: 'disponible',
    permisos: [],
    widgets: [],
    acciones: ['ia-respaldo'],
    tablas: [],
    sql: null,
    depende: [],
    integra: [],
    conectores: [],
    limites: { ia_hora_miembro: 'entero', ia_dia_equipo: 'entero' },
  },
  {
    slug: 'calendario',
    nombre: 'Calendario',
    icono: 'calendario',
    ruta: '/calendario',
    estado: 'disponible',
    permisos: [
      { clave: 'app_calendario', etiqueta: 'Ver Calendario' },
      { clave: 'manage_calendars', etiqueta: 'Gestionar calendarios suscritos' },
    ],
    widgets: ['reuniones'],
    acciones: ['list-calendars', 'add-calendar', 'remove-calendar', 'create-event', 'update-event', 'delete-event'],
    tablas: ['calendar_events', 'calendar_subscriptions', 'calendar_feed_tokens', 'event_attendees'],
    sql: '10-calendario.sql',
    depende: [],
    integra: [],
    conectores: ['calendario'],
    limites: {},
  },
  {
    slug: 'chat',
    nombre: 'Chat',
    icono: 'chat',
    ruta: '/chat',
    estado: 'disponible',
    permisos: [{ clave: 'app_chat', etiqueta: 'Ver Chat' }],
    widgets: [],
    acciones: [],
    tablas: ['chat_channels', 'chat_messages', 'member_status'],
    sql: '11-chat.sql',
    depende: [],
    integra: [],
    conectores: [],
    limites: {},
  },
  {
    slug: 'correo',
    nombre: 'Correo',
    icono: 'correo',
    ruta: '/correo',
    estado: 'disponible',
    permisos: [
      { clave: 'app_correo', etiqueta: 'Ver Correo' },
      { clave: 'view_mail', etiqueta: 'Leer los buzones del equipo' },
    ],
    widgets: [],
    acciones: [],
    // Sin tablas propias hasta la fase 0.2 (comunicación)
    tablas: [],
    sql: null,
    depende: [],
    integra: [],
    conectores: ['correo'],
    limites: { buzones: 'lista' },
  },
  {
    slug: 'proyectos',
    nombre: 'Proyectos',
    icono: 'proyectos',
    ruta: '/proyectos',
    estado: 'disponible',
    permisos: [
      { clave: 'app_proyectos', etiqueta: 'Ver Proyectos' },
      { clave: 'edit_projects', etiqueta: 'Editar proyectos' },
      { clave: 'delete_projects', etiqueta: 'Borrar proyectos' },
    ],
    widgets: ['proyectos'],
    acciones: ['sync-drive-v2', 'project-files', 'create-project-v2', 'drive-status', 'rename-project-folder', 'delete-project', 'reporte-proyecto', 'reportes'],
    tablas: ['projects', 'project_subtasks', 'project_log', 'project_oc', 'project_reports', 'seguimiento_resumenes'],
    sql: '20-proyectos.sql',
    depende: [],
    integra: [],
    conectores: ['archivos'],
    limites: {},
  },
  {
    slug: 'disenos',
    nombre: 'Diseños',
    icono: 'disenos',
    ruta: '/disenos',
    estado: 'disponible',
    permisos: [{ clave: 'app_disenos', etiqueta: 'Ver Diseños' }],
    widgets: [],
    acciones: [],
    // Trabaja sobre las subtareas de proyectos
    tablas: [],
    sql: null,
    depende: ['proyectos'],
    integra: [],
    conectores: [],
    limites: {},
  },
  {
    slug: 'manuales',
    nombre: 'Manuales',
    icono: 'manuales',
    ruta: '/manuales',
    estado: 'disponible',
    permisos: [{ clave: 'app_manuales', etiqueta: 'Ver Manuales' }],
    widgets: [],
    acciones: [],
    tablas: ['manual_reads'],
    sql: '13-manuales.sql',
    depende: [],
    integra: [],
    conectores: [],
    limites: {},
  },
  {
    slug: 'productos',
    nombre: 'Productos',
    icono: 'productos',
    ruta: '/productos',
    estado: 'disponible',
    permisos: [
      { clave: 'app_productos', etiqueta: 'Ver Productos' },
      { clave: 'manage_products', etiqueta: 'Gestionar el catálogo' },
    ],
    widgets: [],
    acciones: [],
    tablas: [
      'products', 'product_price_history', 'product_cambios', 'product_lotes', 'product_variantes', 'product_documentos',
      'marcas', 'marca_tasas', 'familias', 'atributos_def', 'price_lists', 'price_list_items',
    ],
    sql: '22-catalogo.sql',
    depende: [],
    integra: [],
    conectores: ['cambio'],
    limites: {},
  },
  {
    slug: 'directorio',
    nombre: 'Directorio',
    icono: 'directorio',
    ruta: '/directorio',
    estado: 'disponible',
    permisos: [
      { clave: 'app_directorio', etiqueta: 'Ver Directorio' },
      { clave: 'edit_crm', etiqueta: 'Editar contactos y empresas' },
    ],
    widgets: [],
    acciones: [
      'search-companies', 'list-contacts', 'get-contact', 'get-company', 'create-contact', 'update-contact', 'set-contact-company',
      'list-companies', 'company-contacts', 'contact-companies', 'delete-contact', 'create-company', 'update-company', 'delete-company',
      'allies-by-country', 'ensure-crm-properties', 'sync-company-portal',
    ],
    // Los datos viven en el CRM del conector; sin tablas propias
    tablas: [],
    sql: null,
    depende: [],
    integra: [],
    conectores: ['crm'],
    limites: {},
  },
  {
    slug: 'cotizador',
    nombre: 'Cotizador',
    icono: 'cotizador',
    ruta: '/cotizador',
    estado: 'disponible',
    permisos: [{ clave: 'app_cotizador', etiqueta: 'Ver Cotizador' }],
    widgets: [],
    acciones: [],
    tablas: ['quote_drafts', 'crm_clients'],
    sql: '23-cotizador.sql',
    depende: ['productos'],
    integra: ['directorio'],
    conectores: [],
    limites: {},
  },
  {
    slug: 'gerencia',
    nombre: 'Gerencia',
    icono: 'gerencia',
    ruta: '/gerencia',
    estado: 'disponible',
    permisos: [
      { clave: 'app_gerencia', etiqueta: 'Ver Gerencia' },
      { clave: 'view_billing', etiqueta: 'Ver facturación' },
    ],
    widgets: ['facturacion'],
    acciones: ['facturacion-resumen', 'client-projects', 'list-invoices', 'client-invoices', 'facturas-lista', 'facturas-por-tipo', 'resumen-gerencia'],
    tablas: ['facturas', 'factura_lineas', 'factura_vinculos'],
    sql: '26-gerencia.sql',
    depende: ['proyectos'],
    integra: [],
    conectores: ['facturacion'],
    limites: {},
  },
  {
    slug: 'licitaciones',
    nombre: 'Licitaciones',
    icono: 'licitaciones',
    ruta: '/licitaciones',
    estado: 'disponible',
    permisos: [
      { clave: 'app_licitaciones', etiqueta: 'Ver Licitaciones' },
      { clave: 'edit_tender_offers', etiqueta: 'Editar oportunidades y ofertas' },
      { clave: 'delete_tender_offers', etiqueta: 'Eliminar oportunidades y ofertas' },
    ],
    widgets: [],
    acciones: ['crear-oportunidad', 'reporte-oportunidad'],
    tablas: [
      'tenders', 'tender_opportunities', 'tender_offers', 'tender_alerts', 'tender_dismissals', 'tender_notifications',
      'tender_opportunity_reports', 'tender_portal_settings', 'opportunities',
    ],
    sql: '27-licitaciones.sql',
    depende: [],
    integra: ['proyectos'],
    conectores: ['licitaciones'],
    limites: { fuentes: 'lista' },
  },
  {
    slug: 'sitio-web',
    nombre: 'Sitio web',
    icono: 'sitio-web',
    ruta: '/sitio-web',
    estado: 'disponible',
    permisos: [
      { clave: 'app_sitio-web', etiqueta: 'Ver Sitio web' },
      { clave: 'manage_blog', etiqueta: 'Gestionar el blog' },
      // Proyectos de referencia, marcas, aviso y analítica del sitio, como en
      // el grupo «Sitio web» de team-portal (migraciones 6, 7, 41, 60 y 65)
      { clave: 'manage_projects', etiqueta: 'Gestionar proyectos de referencia' },
      { clave: 'manage_brands', etiqueta: 'Gestionar marcas del sitio' },
      { clave: 'manage_notice', etiqueta: 'Gestionar el aviso del sitio' },
      { clave: 'manage_leads', etiqueta: 'Gestionar contactos del sitio' },
      { clave: 'view_analytics', etiqueta: 'Ver analítica del sitio' },
    ],
    widgets: [],
    acciones: ['blog-draft', 'lead-reply'],
    tablas: ['blog_posts', 'site_brands', 'site_events', 'site_leads', 'site_leads_sal', 'site_notice', 'site_projects', 'site_visits'],
    sql: '28-sitio-web.sql',
    depende: [],
    integra: [],
    conectores: [],
    limites: {},
  },
  // Módulos ERP previstos (fases 0.7 a 0.11), solo en el producto
  planeado('inventario', 'Inventario', ['productos']),
  planeado('compras', 'Compras', ['inventario']),
  planeado('ventas', 'Ventas', ['cotizador', 'inventario'], ['directorio']),
  planeado('facturacion', 'Facturación', ['ventas', 'compras'], [], ['facturacion']),
  planeado('cartera', 'Cartera', ['facturacion']),
  planeado('contabilidad', 'Contabilidad', ['facturacion', 'cartera', 'inventario']),
  planeado('rrhh', 'Recursos humanos', []),
]

const POR_SLUG: ReadonlyMap<string, Modulo> = new Map(MODULOS.map((m) => [m.slug, m]))

export type Validacion = { ok: boolean; errores: string[] }

export function moduloPorSlug(slug: string): Modulo | undefined {
  return POR_SLUG.get(slug)
}

// Dependencias duras de un módulo, directas e indirectas, en orden de
// activación (cada una antes de quien la necesita).
export function dependenciasDe(slug: string): string[] {
  const salida: string[] = []
  const visitar = (s: string, camino: string[]) => {
    const m = POR_SLUG.get(s)
    if (!m) return
    for (const d of m.depende) {
      if (camino.includes(d)) continue
      visitar(d, [...camino, d])
      if (!salida.includes(d)) salida.push(d)
    }
  }
  visitar(slug, [slug])
  return salida
}

// Módulos que dependen de este, directa o indirectamente, en orden de
// desactivación (el más lejano primero).
export function dependientesDe(slug: string): string[] {
  const directos = (s: string) => MODULOS.filter((m) => m.depende.includes(s)).map((m) => m.slug)
  const salida: string[] = []
  const visitar = (s: string, camino: string[]) => {
    for (const d of directos(s)) {
      if (camino.includes(d)) continue
      visitar(d, [...camino, d])
      if (!salida.includes(d)) salida.push(d)
    }
  }
  visitar(slug, [slug])
  // Los recogidos en postorden van de la hoja a la raíz, que es el orden pedido
  return salida
}

export function estaActivo(activos: readonly string[], slug: string): boolean {
  return slug === NUCLEO || activos.includes(slug)
}

export function validarActivacion(activos: readonly string[], slug: string): Validacion {
  const m = POR_SLUG.get(slug)
  if (!m) return { ok: false, errores: [`módulo desconocido: ${slug}`] }
  if (m.estado === 'planeado') return { ok: false, errores: [`módulo planeado, todavía sin fase: ${slug}`] }
  const faltan = m.depende.filter((d) => !estaActivo(activos, d))
  if (faltan.length) return { ok: false, errores: faltan.map((d) => `depende de ${d}, que no está activo`) }
  return { ok: true, errores: [] }
}

// Con cascada, «orden» trae los dependientes activos (el más lejano primero)
// y al final el propio módulo.
export function validarDesactivacion(activos: readonly string[], slug: string, cascada = false): Validacion & { orden: string[] } {
  const m = POR_SLUG.get(slug)
  if (!m) return { ok: false, errores: [`módulo desconocido: ${slug}`], orden: [] }
  if (slug === NUCLEO) return { ok: false, errores: ['el núcleo no se desactiva'], orden: [] }
  if (!activos.includes(slug)) return { ok: true, errores: [], orden: [] }
  const dependientes = dependientesDe(slug).filter((d) => activos.includes(d))
  if (dependientes.length && !cascada) {
    return { ok: false, errores: dependientes.map((d) => `${d} depende de ${slug}; usa --cascada para desactivarlo también`), orden: [] }
  }
  return { ok: true, errores: [], orden: [...dependientes, slug] }
}

export function validarLimites(slug: string, limites: Record<string, unknown>): Validacion {
  const m = POR_SLUG.get(slug)
  if (!m) return { ok: false, errores: [`módulo desconocido: ${slug}`] }
  const errores: string[] = []
  for (const clave of Object.keys(limites)) {
    if (!Object.prototype.hasOwnProperty.call(m.limites, clave)) {
      errores.push(`límite no declarado por ${slug}: ${clave}`)
      continue
    }
    const valor = limites[clave]
    if (valor === null) continue
    const tipo = m.limites[clave]
    // isSafeInteger: un número mayor que bigint rompería limite_modulo en cada alta
    if (tipo === 'entero' && !(Number.isSafeInteger(valor) && (valor as number) >= 0)) errores.push(`${clave} debe ser un entero entre 0 y ${Number.MAX_SAFE_INTEGER} o null`)
    if (tipo === 'lista' && !(Array.isArray(valor) && valor.every((v) => typeof v === 'string'))) errores.push(`${clave} debe ser una lista de textos o null`)
  }
  return { ok: errores.length === 0, errores }
}

export function widgetsActivos(activos: readonly string[]): string[] {
  return MODULOS.filter((m) => estaActivo(activos, m.slug)).flatMap((m) => m.widgets)
}

export function accionesDe(slug: string): string[] {
  return [...(POR_SLUG.get(slug)?.acciones ?? [])]
}

export function moduloDeAccion(accion: string): string | undefined {
  return MODULOS.find((m) => m.acciones.includes(accion))?.slug
}

export function tablasDe(slug: string): string[] {
  return [...(POR_SLUG.get(slug)?.tablas ?? [])]
}

// Visibilidad de un módulo (PP-VIS), pura. El núcleo lo ve todo el mundo. Un
// módulo inactivo o planeado no lo ve nadie, ni un administrador. Activo, lo
// ve el admin y quien tenga su permiso app_<slug>; un módulo que no declara
// app_<slug> (una capacidad como ia) lo ve cualquier miembro. Es solo la
// interfaz: has_modulo y las políticas modulo_* deciden en la base.
export function puedeVerModulo(
  slug: string,
  roles: readonly string[] | null,
  permisos: readonly string[] | null,
  activos: readonly string[],
): boolean {
  if (slug === NUCLEO) return true
  const m = POR_SLUG.get(slug)
  if (!m || m.estado !== 'disponible' || !activos.includes(slug)) return false
  if ((roles ?? []).includes('admin')) return true
  const clave = `app_${slug}`
  if (!m.permisos.some((p) => p.clave === clave)) return true
  return (permisos ?? []).includes(clave)
}

// Módulos con pantalla que este usuario ve, en el orden del registro (sin el núcleo)
export function modulosVisibles(
  roles: readonly string[] | null,
  permisos: readonly string[] | null,
  activos: readonly string[],
): Modulo[] {
  return MODULOS.filter((m) => m.slug !== NUCLEO && m.ruta !== null && puedeVerModulo(m.slug, roles, permisos, activos))
}

// Solo los widgets de módulos activos; un id que ningún módulo declara se
// descarta (falla cerrado)
export function filtrarWidgets<T extends { id: string }>(items: readonly T[], activos: readonly string[]): T[] {
  const permitidos = new Set(widgetsActivos(activos))
  return items.filter((w) => permitidos.has(w.id))
}

export type GrupoPermisos = { label: string; keys: string[] }

// Columnas de la matriz de roles agrupadas por módulo activo, con los
// permisos que declara el registro. Lo del catálogo del shell que ningún
// módulo declara va en «Otros»; lo de un módulo inactivo no se muestra.
export function gruposPermisos(activos: readonly string[], catalogo: readonly string[]): GrupoPermisos[] {
  const grupos: GrupoPermisos[] = MODULOS.filter((m) => m.estado === 'disponible' && estaActivo(activos, m.slug) && m.permisos.length > 0).map(
    (m) => ({ label: m.nombre, keys: m.permisos.map((p) => p.clave) }),
  )
  const declarados = new Set(MODULOS.flatMap((m) => m.permisos.map((p) => p.clave)))
  const otros = catalogo.filter((k) => !declarados.has(k))
  if (otros.length) grupos.push({ label: 'Otros', keys: otros })
  return grupos
}

export function etiquetaPermiso(clave: string): string | undefined {
  for (const m of MODULOS) {
    const p = m.permisos.find((x) => x.clave === clave)
    if (p) return p.etiqueta
  }
  return undefined
}

// Módulo cuya ruta base contiene esta ruta del shell (sin el núcleo)
export function moduloDeRuta(pathname: string): Modulo | undefined {
  const primera = pathname.split('/').filter(Boolean)[0]
  if (!primera) return undefined
  return MODULOS.find((m) => m.slug !== NUCLEO && m.ruta === `/${primera.toLowerCase()}`)
}
