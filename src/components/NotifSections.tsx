import { useState } from 'react'
import { Link } from 'react-router'
import {
  useNotifications,
  type MiNotif,
  type RadarNotif,
} from '../context/NotificationsContext'
import { esEnlaceInterno } from '../lib/enlaces'

// Secciones de notificaciones personales y del radar. Las comparten la
// barra derecha (escritorio) y la hoja de la campana (móvil): mismos
// datos y acciones vía NotificationsContext.

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

export default function NotifSections({ onNavigate }: { onNavigate?: () => void }) {
  const {
    mine,
    radar,
    marcarMisLeidas,
    marcarRadarLeidas,
    abrirMiNotif,
    abrirRadarNotif,
    historialMio,
    historialRadar,
  } = useNotifications()

  // Historial (últimas 15, leídas incluidas) por sección
  const [histMine, setHistMine] = useState<MiNotif[] | null>(null)
  const [histRadar, setHistRadar] = useState<RadarNotif[] | null>(null)

  async function toggleHistMine() {
    setHistMine(histMine ? null : await historialMio())
  }
  async function toggleHistRadar() {
    setHistRadar(histRadar ? null : await historialRadar())
  }

  const listaMine = histMine ?? mine
  const listaRadar = histRadar ?? radar

  return (
    <>
      <div className="rail-section">
        <div className="rail-head">
          <span className="rail-title">Notificaciones</span>
          <span className="rail-head-actions">
            {mine.length > 0 && !histMine && (
              <button className="rail-clear" onClick={() => void marcarMisLeidas()}>
                Marcar leídas
              </button>
            )}
            <button
              className={`rail-clear ${histMine ? 'active' : ''}`}
              onClick={() => void toggleHistMine()}
            >
              {histMine ? 'Solo nuevas' : 'Historial'}
            </button>
          </span>
        </div>
        {listaMine.length === 0 ? (
          <span className="muted small">
            {histMine ? 'Sin notificaciones recientes.' : 'Sin notificaciones nuevas.'}
          </span>
        ) : (
          <div className="rail-notifs">
            {listaMine.map((n) => (
              <Link
                key={n.id}
                // Solo rutas del portal: un enlace externo guardado antes del
                // CHECK de la 63 (NOT VALID) abre Proyectos en su lugar
                to={esEnlaceInterno(n.link) ? n.link : '/apps/proyectos'}
                className={`rail-notif ${n.read ? 'leida' : ''}`}
                onClick={() => {
                  if (!n.read) void abrirMiNotif(n)
                  onNavigate?.()
                }}
              >
                <span className="rail-notif-title">{n.title}</span>
                {n.body && <span className="muted small">{n.body}</span>}
                {histMine && (
                  <span className="muted small rail-notif-date">{fechaCorta(n.created_at)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rail-section">
        <div className="rail-head">
          <span className="rail-title">Radar</span>
          <span className="rail-head-actions">
            {radar.length > 0 && !histRadar && (
              <button className="rail-clear" onClick={() => void marcarRadarLeidas()}>
                Marcar leídas
              </button>
            )}
            <button
              className={`rail-clear ${histRadar ? 'active' : ''}`}
              onClick={() => void toggleHistRadar()}
            >
              {histRadar ? 'Solo nuevas' : 'Historial'}
            </button>
          </span>
        </div>
        {listaRadar.length === 0 ? (
          <span className="muted small">
            {histRadar ? 'Sin avisos recientes.' : 'Sin avisos del radar.'}
          </span>
        ) : (
          <div className="rail-notifs">
            {listaRadar.map((n) => (
              <Link
                key={n.id}
                // Enlace profundo a la licitación concreta (la app abre su
                // detalle con ?licitacion=<id>)
                to={`/apps/licitaciones?licitacion=${encodeURIComponent(n.tender_id)}`}
                className={`rail-notif ${n.read ? 'leida' : ''}`}
                onClick={() => {
                  if (!n.read) void abrirRadarNotif(n)
                  onNavigate?.()
                }}
              >
                <span className="rail-notif-title">{n.title}</span>
                <span className="muted small">
                  {n.country}
                  {histRadar ? ` · ${fechaCorta(n.created_at)}` : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
