import { useId, useRef, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useDialogo } from '../lib/useDialogo'

// Modal del shell: velo .modal-overlay y caja .modal con role=dialog,
// aria-modal y aria-labelledby con su título. Foco inicial, trampa de Tab,
// Escape y retorno del foco los pone useDialogo. Con onSubmit la caja es un
// <form>. Escape y el clic en el fondo preguntan antes de cerrar si sucio()
// devuelve true; los botones propios (Cancelar, ×) llaman a onClose directo.
//
// Se monta en <body>: así no lo recorta un contenedor con transform ni lo
// alcanza el inert del cajón móvil.

interface Props {
  titulo: ReactNode
  onClose: () => void
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** false: el clic en el fondo no cierra (dejar el motivo escrito). */
  cerrarAlFondo?: boolean
  /** true si hay cambios sin guardar. */
  sucio?: () => boolean
  /** Campo que recibe el foco al abrir; sin él, [data-foco] o el primer campo. */
  focoInicial?: RefObject<HTMLElement | null> | string
  /** A dónde vuelve el foco al cerrar, si quien abrió ya no existe. */
  retorno?: RefObject<HTMLElement | null> | (() => HTMLElement | null)
  /** Clases extra de la caja, p. ej. «modal-ancho». */
  className?: string
  children?: ReactNode
}

export default function Dialogo({
  titulo,
  onClose,
  onSubmit,
  cerrarAlFondo = true,
  sucio,
  focoInicial,
  retorno,
  className,
  children,
}: Props) {
  const idTitulo = useId()
  const caja = useRef<HTMLElement | null>(null)
  // Solo cierra un clic que empieza y termina en el velo: arrastrar una
  // selección desde un campo hasta afuera no pierde lo escrito
  const desdeVelo = useRef(false)
  const { pedirCierre } = useDialogo(caja, { alCerrar: onClose, sucio, focoInicial, retorno })

  const comun = {
    className: `modal${className ? ` ${className}` : ''}`,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': idTitulo,
    tabIndex: -1,
  } as const
  const contenido = (
    <>
      <h2 id={idTitulo} className="modal-titulo">
        {titulo}
      </h2>
      {children}
    </>
  )

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        desdeVelo.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        const valido = desdeVelo.current && e.target === e.currentTarget
        desdeVelo.current = false
        if (valido && cerrarAlFondo) pedirCierre()
      }}
    >
      {onSubmit ? (
        <form
          {...comun}
          ref={(el) => {
            caja.current = el
          }}
          onSubmit={onSubmit}
        >
          {contenido}
        </form>
      ) : (
        <div
          {...comun}
          ref={(el) => {
            caja.current = el
          }}
        >
          {contenido}
        </div>
      )}
    </div>,
    document.body
  )
}
