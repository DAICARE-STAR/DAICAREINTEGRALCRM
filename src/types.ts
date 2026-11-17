// Los roles ahora son dinámicos (tabla `roles`); 'admin' sigue siendo
// el rol especial con todos los permisos.
export type Role = string

// Catálogo de permisos asignables a un rol. La aplicación real ocurre en
// RLS (Supabase) y en la Netlify Function; esto alimenta la UI.
export const PERMISSIONS = [
  {
    key: 'manage_apps',
    label: 'Gestionar aplicaciones',
    description: 'Crear, editar y eliminar las apps del portal',
  },
  {
    key: 'manage_connectors',
    label: 'Gestionar herramientas',
    description: 'Crear, editar y eliminar los enlaces a herramientas externas',
  },
  {
    key: 'manage_members',
    label: 'Gestionar miembros',
    description: 'Cambiar el rol de los miembros (nunca sobre cuentas admin)',
  },
  {
    key: 'manage_roles',
    label: 'Gestionar roles',
    description: 'Crear y editar roles (los permisos sensibles solo los otorga un admin)',
  },
  {
    key: 'manage_blog',
    label: 'Gestionar blog',
    description: 'Crear, editar y publicar entradas del blog de empresa.test',
  },
  {
    key: 'manage_brands',
    label: 'Gestionar marcas',
    description: 'Editar el portafolio de marcas que se muestra en empresa.test',
  },
  {
    key: 'manage_projects',
    label: 'Gestionar proyectos',
    description: 'Crear y editar los proyectos de referencia de empresa.test',
  },
  {
    key: 'manage_notice',
    label: 'Gestionar aviso del sitio',
    description: 'Activar y editar el aviso técnico que se muestra en empresa.test',
  },
  {
    key: 'manage_leads',
    label: 'Gestionar leads del sitio',
    description: 'Ver y gestionar las consultas del formulario de contacto de empresa.test',
  },
  {
    key: 'view_analytics',
    label: 'Ver analítica del sitio',
    description: 'Consultar las visitas de empresa.test (Sitio web → Analítica)',
  },
  {
    key: 'view_billing',
    label: 'Ver facturación',
    description: 'Ver el widget de facturación reciente (PortalFactura)',
  },
  {
    key: 'view_mail',
    label: 'Ver correo del equipo',
    description: 'Leer la bandeja de entrada del correo del equipo (Titan, solo lectura)',
  },
  {
    key: 'edit_crm',
    label: 'Editar CRM',
    description: 'Crear y editar cuentas, contactos y actividades del CRM (ver exige Ver CRM)',
  },
  {
    key: 'exportar_crm',
    label: 'Exportar CRM',
    description: 'Descargar en CSV la lista de cuentas del CRM, sin datos de salud; cada exportación queda en la auditoría',
  },
  {
    key: 'ver_salud',
    label: 'Ver datos de salud',
    description: 'Leer la historia de salud de las personas atendidas, con segundo factor activo; cada lectura queda registrada',
  },
  {
    key: 'edit_salud',
    label: 'Editar datos de salud',
    description: 'Registrar y corregir la historia de salud de una persona con consentimiento vigente, con segundo factor activo',
  },
  {
    key: 'edit_projects',
    label: 'Editar proyectos',
    description: 'Crear y editar proyectos del tablero Proyectos; ver es libre',
  },
  {
    key: 'delete_projects',
    label: 'Eliminar proyectos',
    description:
      'Eliminar proyectos del tablero Proyectos con sus subtareas y bitácora; la carpeta de Drive va a la papelera',
  },
  {
    key: 'view_credentials',
    label: 'Ver credenciales',
    description: 'Ver los accesos del equipo a los portales de licitación (Radar)',
  },
  {
    key: 'manage_credentials',
    label: 'Gestionar credenciales',
    description: 'Crear, editar y eliminar los accesos a los portales de licitación',
  },
  {
    key: 'manage_products',
    label: 'Gestionar productos',
    description: 'Crear, editar y archivar productos del catálogo (buscador del Cotizador)',
  },
  {
    key: 'edit_tender_offers',
    label: 'Editar oportunidades de licitación',
    description:
      'Crear y editar oportunidades de licitación y sus ofertas (app Licitaciones); ver requiere la app',
  },
  {
    key: 'delete_tender_offers',
    label: 'Eliminar oportunidades y ofertas de licitación',
    description:
      'Eliminar oportunidades de licitación (con sus ofertas) y ofertas sueltas, activas o canceladas (app Licitaciones); queda en la auditoría',
  },
] as const

export type Permission = (typeof PERMISSIONS)[number]['key']

// Permisos que solo un admin otorga (lista única): igual a
// permisos_solo_admin() de la migración 88 y a netlify/lib/autorizacion.mts;
// src/lib/__tests__/permisos.test.ts vigila la sincronía con el SQL.
// bot_asistente e ia_worker son de cuentas de servicio: no están en
// PERMISSIONS y no aparecen en la matriz de Roles.
export const PERMISOS_SOLO_ADMIN: readonly string[] = [
  'manage_roles',
  'manage_members',
  'manage_apps',
  'manage_connectors',
  'view_credentials',
  'manage_credentials',
  'view_mail',
  'view_billing',
  'bot_asistente',
  'ia_worker',
  'delete_projects',
  'delete_tender_offers',
  'ver_salud',
  'edit_salud',
]

export interface RoleDef {
  name: string
  description: string | null
  is_system: boolean
  permissions: string[]
  // Jerarquía manual (mayor = más alto; define el chip/color del usuario) y
  // color del rol. Ausentes hasta aplicar la migración 26.
  position: number
  color: string | null
}

// Catálogo de marcas representadas (migración 74, tabla public.marcas). Las
// tasas y los servicios vienen del Excel «margenes de utilidad» y los edita
// un administrador en Administración → Marcas.
export type MonedaServicio = 'EUR' | 'USD' | 'COP'

export interface Marca {
  id: string
  nombre: string
  alias: string[]
  nit: string | null
  // Comisión (%) cuando la venta es por comisión; 0-100
  tasa_comision: number | null
  // Margen de utilidad (%) por defecto para la venta directa; 0-100
  mu_default: number | null
  // Servicio recurrente que la marca paga: valor, divisa y cada cuántos meses
  servicio_valor: number | null
  servicio_moneda: MonedaServicio | null
  servicio_cada_meses: number | null
  activa: boolean
  notas: string | null
  created_at: string
  updated_at: string
}

// Una fila del historial de la tasa (public.marca_tasas): solo la escribe el
// trigger de la base al cambiar marcas.tasa_comision
export interface MarcaTasa {
  marca_id: string
  tasa_comision: number | null
  vigente_desde: string
  nota: string | null
  actor: string | null
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  // Rol principal (cache del de mayor jerarquía): define el chip que se muestra.
  role: Role
  // Todos los roles del usuario (unión). 'admin' aquí = superusuario.
  roles: string[]
  // Unión de permisos de todos sus roles.
  permissions: string[]
}

export interface PortalApp {
  id: string
  slug: string
  name: string
  description: string | null
  url: string
  icon: string | null
  roles: Role[] | null
  active: boolean
  sort_order: number
}

export interface Connector {
  id: string
  name: string
  description: string | null
  url: string
  icon: string | null
  category: string | null
  roles: Role[] | null
  active: boolean
  sort_order: number
}

// Widget del panel de inicio (tabla portal_widgets, migración 30).
// Los widgets nacen en el código; la tabla decide disponibilidad,
// roles y orden. roles null = todos.
export interface PortalWidget {
  id: string
  name: string
  description: string | null
  active: boolean
  roles: Role[] | null
  sort_order: number
}

// Marca del portafolio público de empresa.test (tabla site_brands)
export interface SiteBrand {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
  downloads_url: string | null
  sort_order: number
  active: boolean
  // Ficha /marcas/<slug> (migración 65; reglas de envío en lib/sitioWeb.ts).
  // slug null = sin ficha ni tema; vacío = null en origin y summary.
  slug: string | null
  origin: string | null
  summary: string | null
  description_md: string
  page_published: boolean
}

// Proyecto de referencia del sitio público (tabla site_projects)
export interface SiteProject {
  id: string
  slug: string
  title: string
  category: string | null
  location: string | null
  description_md: string
  cover_url: string | null
  gallery: string[]
  published: boolean
  published_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // Temas: slugs de servicio o de marca (migración 65); nunca null
  topics: string[]
}

// Evento del calendario del equipo (tabla calendar_events)
export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  meeting_url: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  remind_minutes: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Vínculo con la copia en un calendario de Google (migración 34; las
  // columnas pueden no existir aún — select * las omite y quedan undefined)
  google_calendar_id?: string | null
  google_event_id?: string | null
  // Reunión periódica (migración 82): una fila por ocurrencia
  serie_id?: string | null
  repeticion?: Repeticion | null
  serie_inicio?: string | null
}

export type Repeticion = 'semanal' | 'quincenal' | 'mensual'

// Calendario externo suscrito por URL .ics (tabla calendar_subscriptions).
// `url` solo la ve su dueño (RLS): lleva el token privado de Google.
export interface CalendarSubscription {
  id: string
  owner_id: string
  name: string
  url: string
  color: string
  scope: 'personal' | 'team'
  active: boolean
}

// Calendario tal como lo reporta la función (sin la URL secreta)
export interface ExternalCalendarInfo {
  id: string
  name: string
  color: string
  scope: string
  error?: string
}

// Evento traído de un calendario externo: solo lectura, no vive en la base
export interface ExternalEvent {
  id: string
  calendarId: string
  title: string
  location: string | null
  description: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
}

export type AttendeeStatus = 'pending' | 'accepted' | 'declined'

export interface EventAttendee {
  event_id: string
  user_id: string
  status: AttendeeStatus
  // true = invitado por el creador; false = RSVP espontáneo en evento
  // abierto. Ausente si la migración 15 no está aplicada (se trata como
  // invitado, que era el comportamiento anterior).
  invited?: boolean
}

// Miembro visible para todo el equipo (calendario, chat y equipo)
export interface TeamMember {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: Role
}

// Última conexión registrada (tabla member_status, latido del portal)
export interface MemberStatus {
  user_id: string
  last_seen_at: string
}

// Canal del chat del equipo (tabla chat_channels)
export interface ChatChannel {
  id: string
  name: string
  description: string | null
  created_by: string | null
}

// Mensaje del chat (tabla chat_messages)
export interface ChatMessage {
  id: string
  channel_id: string
  user_id: string
  content: string
  created_at: string
}

// Aviso técnico del sitio público (tabla site_notice, fila única id=1)
export interface SiteNotice {
  id: number
  enabled: boolean
  title: string
  message: string
  variant: 'banner' | 'overlay'
  updated_at: string
}

export type LeadStatus = 'nuevo' | 'contactado' | 'descartado'

// Consulta del formulario de contacto del sitio público (tabla site_leads)
export interface SiteLead {
  id: string
  created_at: string
  name: string
  email: string
  company: string | null
  phone: string | null
  message: string
  source: string
  status: LeadStatus
  note: string | null
  handled_by: string | null
  updated_at: string
}

// Entrada del blog público de empresa.test (tabla blog_posts)
export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  content_md: string
  cover_url: string | null
  category: string | null
  published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  // Posicionamiento (migración 65): seo_title null = el sitio lo deriva del
  // título; key_points y topics nunca null
  seo_title: string | null
  key_points: string[]
  topics: string[]
}
