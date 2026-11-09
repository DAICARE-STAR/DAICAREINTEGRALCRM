import type { ReactNode } from 'react'

// Estado vacío de una lista o vista: dice la causa y la siguiente acción.
// Un error de permiso nombra el permiso que falta. Sin ilustraciones.

interface Props {
  causa: string
  /** Botón con la siguiente acción. */
  accion?: ReactNode
  /** Clave del permiso que falta («manage_members»): es un error de permiso. */
  permiso?: string
}

export default function EstadoVacio({ causa, accion, permiso }: Props) {
  return (
    <div className="estado-vacio" role={permiso ? 'alert' : undefined}>
      <p>{causa}</p>
      {permiso && (
        <p>
          Falta el permiso <code>{permiso}</code>; pídelo a un administrador.
        </p>
      )}
      {accion && <div className="estado-vacio-accion">{accion}</div>}
    </div>
  )
}
