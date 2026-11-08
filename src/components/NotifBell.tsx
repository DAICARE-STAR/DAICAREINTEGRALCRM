import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '../context/NotificationsContext'
import { useDialogo } from '../lib/useDialogo'
import { useEsMovil } from '../lib/useEsMovil'
import NotifSections from './NotifSections'

// Campana del topbar móvil: en pantallas angostas la barra derecha se
// oculta y sin esto las notificaciones quedarían invisibles. Muestra el
// total sin leer y abre una hoja con las mismas secciones de la barra.
//
// useDialogo pone el foco en la hoja al abrir, la cierra con Escape y
// devuelve el foco a la campana. En móvil la hoja es modal (Tab no sale);
// en la campana flotante (761–1180 px) es un panel no modal
// (aria-modal="false") que se cierra cuando el foco se va a otro sitio.

export default function NotifBell() {
  const { unread } = useNotifications()
  const [open, setOpen] = useState(false)
  const esMovil = useEsMovil()
  const wrapRef = useRef<HTMLDivElement>(null)
  const hojaRef = useRef<HTMLDivElement>(null)
  useDialogo(hojaRef, { alCerrar: () => setOpen(false), activo: open })

  // Cerrar al tocar fuera de la hoja (Escape lo atiende useDialogo)
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div
      className="notif-bell-wrap"
      ref={wrapRef}
      onBlur={(e) => {
        // Panel no modal: si el foco sale a otro control, se cierra
        const destino = e.relatedTarget as Node | null
        if (open && destino && !wrapRef.current?.contains(destino)) setOpen(false)
      }}
    >
      <button
        type="button"
        className="nav-burger notif-bell"
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div
          ref={hojaRef}
          className="notif-sheet"
          role="dialog"
          aria-modal={esMovil ? 'true' : 'false'}
          aria-label="Notificaciones"
          tabIndex={-1}
        >
          <NotifSections onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
