import type { ReactNode } from 'react'
import CabeceraPagina from '../../components/CabeceraPagina'

// Cabecera con la que arranca cada sección de Administración: la cabecera
// común (GUIA-UI, «Cabeceras») en h2, con su «i» al lado, fuera del h2
// (GUIA-UI, Accesibilidad), y a la derecha las acciones o filtros de la
// sección.
export default function CabeceraAdmin({
  titulo,
  ayuda,
  children,
}: {
  titulo: ReactNode
  ayuda?: string
  children?: ReactNode
}) {
  return (
    <CabeceraPagina nivel={2} titulo={titulo} ayuda={ayuda}>
      {children}
    </CabeceraPagina>
  )
}
