import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogo } from '../lib/useDialogo'
import Pestanas, { PanelPestana, type Pestana } from './Pestanas'

// Cajón lateral con pestañas (la ficha de un registro): role=dialog con su
// título, pestañas en dos grupos como máximo (el campo grupo de Pestana),
// foco atrapado, Escape y retorno del foco con useDialogo, y #root inert
// mientras está abierto. Si sucio() devuelve true, Escape, el fondo y el
// botón Cerrar preguntan antes de cerrar.

interface Props<T extends string> {
  titulo: ReactNode
  pestanas: Pestana<T>[]
  activa: T
  onCambiar: (id: T) => void
  onClose: () => void
  sucio?: () => boolean
  children?: ReactNode
}

export default function CajonPestanas<T extends string>({
  titulo,
  pestanas,
  activa,
  onCambiar,
  onClose,
  sucio,
  children,
}: Props<T>) {
  const idBase = useId()
  const caja = useRef<HTMLElement | null>(null)
  const { pedirCierre } = useDialogo(caja, { alCerrar: onClose, sucio })

  useEffect(() => {
    const raiz = document.getElementById('root')
    raiz?.setAttribute('inert', '')
    return () => raiz?.removeAttribute('inert')
  }, [])

  return createPortal(
    <div
      className="modal-overlay cajon-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) pedirCierre()
      }}
    >
      <aside
        className="cajon"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idBase}-titulo`}
        tabIndex={-1}
        ref={(el) => {
          caja.current = el
        }}
      >
        <div className="cajon-cabecera">
          <h2 id={`${idBase}-titulo`}>{titulo}</h2>
          <button type="button" className="btn-ghost" aria-label="Cerrar" onClick={pedirCierre}>
            ×
          </button>
        </div>
        <Pestanas pestanas={pestanas} activa={activa} onCambiar={onCambiar} etiqueta="Secciones" idBase={idBase} />
        <PanelPestana idBase={idBase} id={activa} className="cajon-cuerpo">
          {children}
        </PanelPestana>
      </aside>
    </div>,
    document.body
  )
}
