import type { ReactNode } from 'react'

// Iconos del menú lateral: juego «Iconos de navegación», final
// unificado (1A Inicio · 2A Herramientas · 3B Chat · 4B Correo · 5A
// Calendario · 6A Equipo · 7A Administración). Cuadrícula de 24, trazo 2 con
// extremos redondeados, sin relleno, una sola tinta (currentColor). Para
// reemplazar uno basta con cambiar los hijos de su componente.
type Props = { size?: number }

function Icono({ size = 20, children }: Props & { children: ReactNode }) {
  return (
    <svg
      className="nav-ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Casa con tejado a dos aguas y puerta
export function IconoInicio(p: Props) {
  return (
    <Icono {...p}>
      <path d="M3 10L12 3L21 10V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19Z" />
      <path d="M9 21V14H15V21" />
    </Icono>
  )
}

// Llave inglesa con boca a 45°
export function IconoHerramientas(p: Props) {
  return (
    <Icono {...p}>
      <path d="M14.5 6.5L17.5 9.5L20.5 6.5A5.4 5.4 0 0 1 13.5 13.5L7.5 19.5A2.1 2.1 0 0 1 4.5 16.5L10.5 10.5A5.4 5.4 0 0 1 17.5 3.5Z" />
    </Icono>
  )
}

// Globo de conversación circular con cola
export function IconoChat(p: Props) {
  return (
    <Icono {...p}>
      <path d="M8.5 19A8.5 8.5 0 1 0 6 17L3 21Z" />
    </Icono>
  )
}

// Sobre en un solo trazo
export function IconoCorreo(p: Props) {
  return (
    <Icono {...p}>
      <path d="M21 5L12 12.5L3 5H21V19H3V5" />
    </Icono>
  )
}

// Hoja, línea de cabecera y par de anillas
export function IconoCalendario(p: Props) {
  return (
    <Icono {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 11H21" />
      <path d="M8 4V8M16 4V8" />
    </Icono>
  )
}

// Persona delante y persona detrás en una sola línea
export function IconoEquipo(p: Props) {
  return (
    <Icono {...p}>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M15 21A6 6 0 0 0 3 21" />
      <path d="M15.5 4A3.6 3.6 0 0 1 17 10.5C19 12 21 15 21 20" />
    </Icono>
  )
}

// Engranaje de 8 dientes con eje
export function IconoAdministracion(p: Props) {
  return (
    <Icono {...p}>
      <path d="M10.5 5L11 3H13L13.5 5L16 6L17.5 5L19 6.5L18 8L19 10.5L21 11V13L19 13.5L18 16L19 17.5L17.5 19L16 18L13.5 19L13 21H11L10.5 19L8 18L6.5 19L5 17.5L6 16L5 13.5L3 13V11L5 10.5L6 8L5 6.5L6.5 5L8 6Z" />
      <circle cx="12" cy="12" r="3" />
    </Icono>
  )
}
