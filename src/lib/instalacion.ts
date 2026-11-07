// Datos de la instalación que llegan por el entorno del build. El resto
// (tema, logos, módulos) vendrá de la tabla instalacion en fases posteriores.

export const NOMBRE_PORTAL_POR_DEFECTO = 'Portal del equipo'

export const NOMBRE_PORTAL: string = import.meta.env.VITE_PORTAL_NOMBRE?.trim() || NOMBRE_PORTAL_POR_DEFECTO
