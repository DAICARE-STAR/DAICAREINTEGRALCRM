import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { WidgetCard } from './WidgetCard'

// Relojes mundiales configurables en el dashboard. Cada quien elige sus
// ciudades; se guardan por navegador. El segundero se detiene con la
// pestaña oculta y solo repinta los relojes, no el menú de ajustes.

interface Zona {
  tz: string
  label: string
  region: string
}

// Zonas que se ofrecen (etiqueta amigable → zona IANA), agrupadas por región
// porque la lista es larga.
const ZONAS: Zona[] = [
  // --- Sudamérica ---
  { tz: 'America/Bogota', label: 'Bogotá', region: 'Sudamérica' },
  { tz: 'America/Lima', label: 'Lima', region: 'Sudamérica' },
  { tz: 'America/Guayaquil', label: 'Quito / Guayaquil', region: 'Sudamérica' },
  { tz: 'America/La_Paz', label: 'La Paz', region: 'Sudamérica' },
  { tz: 'America/Santiago', label: 'Santiago', region: 'Sudamérica' },
  { tz: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', region: 'Sudamérica' },
  { tz: 'America/Asuncion', label: 'Asunción', region: 'Sudamérica' },
  { tz: 'America/Montevideo', label: 'Montevideo', region: 'Sudamérica' },
  { tz: 'America/Sao_Paulo', label: 'São Paulo', region: 'Sudamérica' },
  { tz: 'America/Caracas', label: 'Caracas', region: 'Sudamérica' },

  // --- Centroamérica y Caribe ---
  { tz: 'America/Panama', label: 'Panamá', region: 'Centroamérica y Caribe' },
  { tz: 'America/Costa_Rica', label: 'San José', region: 'Centroamérica y Caribe' },
  { tz: 'America/Managua', label: 'Managua', region: 'Centroamérica y Caribe' },
  { tz: 'America/Tegucigalpa', label: 'Tegucigalpa', region: 'Centroamérica y Caribe' },
  { tz: 'America/El_Salvador', label: 'San Salvador', region: 'Centroamérica y Caribe' },
  { tz: 'America/Guatemala', label: 'Guatemala', region: 'Centroamérica y Caribe' },
  { tz: 'America/Belize', label: 'Belice', region: 'Centroamérica y Caribe' },
  { tz: 'America/Santo_Domingo', label: 'Santo Domingo', region: 'Centroamérica y Caribe' },
  { tz: 'America/Havana', label: 'La Habana', region: 'Centroamérica y Caribe' },
  { tz: 'America/Puerto_Rico', label: 'San Juan', region: 'Centroamérica y Caribe' },

  // --- Norteamérica ---
  { tz: 'America/Mexico_City', label: 'Ciudad de México', region: 'Norteamérica' },
  { tz: 'America/Cancun', label: 'Cancún', region: 'Norteamérica' },
  { tz: 'America/Tijuana', label: 'Tijuana', region: 'Norteamérica' },
  { tz: 'America/New_York', label: 'Nueva York', region: 'Norteamérica' },
  { tz: 'America/Chicago', label: 'Chicago', region: 'Norteamérica' },
  { tz: 'America/Denver', label: 'Denver', region: 'Norteamérica' },
  { tz: 'America/Phoenix', label: 'Phoenix', region: 'Norteamérica' },
  { tz: 'America/Los_Angeles', label: 'Los Ángeles', region: 'Norteamérica' },
  { tz: 'America/Toronto', label: 'Toronto', region: 'Norteamérica' },
  { tz: 'America/Vancouver', label: 'Vancouver', region: 'Norteamérica' },

  // --- Europa y resto ---
  { tz: 'Europe/Rome', label: 'Roma', region: 'Europa y resto' },
  { tz: 'Europe/Madrid', label: 'Madrid', region: 'Europa y resto' },
  { tz: 'Europe/London', label: 'Londres', region: 'Europa y resto' },
  { tz: 'Asia/Dubai', label: 'Dubái', region: 'Europa y resto' },
  { tz: 'Asia/Shanghai', label: 'Shanghái', region: 'Europa y resto' },
]

// Orden en que se ofrecen las regiones al añadir una ciudad
const REGIONES = ['Sudamérica', 'Centroamérica y Caribe', 'Norteamérica', 'Europa y resto']

const CLOCKS_KEY = 'pt_clocks_v1'
// Por defecto, la zona del navegador si está en la lista (la de la instalación
// llega con instalacion.zona_horaria) y Londres como referencia
const DEFAULT_TZS = [Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/London'].filter(
  (tz, i, a) => ZONAS.some((z) => z.tz === tz) && a.indexOf(tz) === i
)

function loadClocks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOCKS_KEY) || 'null')
    if (Array.isArray(raw) && raw.length > 0) {
      const valid = raw.filter((tz) => ZONAS.some((z) => z.tz === tz))
      if (valid.length > 0) return valid
    }
  } catch {
    /* sin almacenamiento */
  }
  return DEFAULT_TZS
}

function labelDe(tz: string): string {
  return ZONAS.find((z) => z.tz === tz)?.label ?? tz
}

// Formateadores por zona, creados una sola vez (antes, cuatro por reloj
// en cada segundo)
interface Formatos {
  hora: Intl.DateTimeFormat
  seg: Intl.DateTimeFormat
  fecha: Intl.DateTimeFormat
  off: Intl.DateTimeFormat
}
const FORMATOS = new Map<string, Formatos>()

function formatos(tz: string): Formatos {
  let f = FORMATOS.get(tz)
  if (!f) {
    f = {
      hora: new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }),
      seg: new Intl.DateTimeFormat('es-CO', { timeZone: tz, second: '2-digit' }),
      fecha: new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }),
      off: new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }),
    }
    FORMATOS.set(tz, f)
  }
  return f
}

function partes(now: Date, tz: string) {
  const f = formatos(tz)
  return {
    hora: f.hora.format(now),
    seg: f.seg.format(now),
    fecha: f.fecha.format(now),
    // Offset GMT (p. ej. "GMT-5")
    off: f.off.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '',
  }
}

// La hora actual, cada segundo mientras la pestaña está visible
function useAhora(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id: number | undefined
    const parar = () => {
      if (id !== undefined) window.clearInterval(id)
      id = undefined
    }
    const alCambiar = () => {
      if (document.hidden) return parar()
      if (id !== undefined) return
      setNow(new Date())
      id = window.setInterval(() => setNow(new Date()), 1000)
    }
    alCambiar()
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      parar()
      document.removeEventListener('visibilitychange', alCambiar)
    }
  }, [])
  return now
}

function Relojes({ tzs }: { tzs: string[] }) {
  const now = useAhora()
  return (
    <div className="clock-row">
      {tzs.map((tz) => {
        const p = partes(now, tz)
        return (
          <div key={tz} className="clock-card" title={tz}>
            <span className="clock-city">{labelDe(tz)}</span>
            <span className="clock-time">
              {p.hora}
              <span className="clock-seg">{p.seg}</span>
            </span>
            <span className="muted small">
              {p.fecha} · {p.off}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function WorldClockWidget() {
  const [tzs, setTzs] = useState<string[]>(loadClocks)
  const [ajustes, setAjustes] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const ajustesBtnRef = useRef<HTMLButtonElement>(null)
  const idAjustes = useId()

  // Cerrar ajustes al hacer clic fuera (solo con el panel abierto)
  useEffect(() => {
    if (!ajustes) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAjustes(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [ajustes])

  // Escape (en el botón o dentro del panel) lo cierra y devuelve el foco a
  // «Ajustes»
  function onAjustesKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!ajustes || (e.key !== 'Escape' && e.key !== 'Esc')) return
    e.preventDefault()
    e.stopPropagation()
    setAjustes(false)
    ajustesBtnRef.current?.focus()
  }

  // Si el foco sale a otro control (Tab), el panel se cierra para no taparlo
  function onAjustesBlur(e: FocusEvent<HTMLDivElement>) {
    const destino = e.relatedTarget as Node | null
    if (ajustes && destino && !e.currentTarget.contains(destino)) setAjustes(false)
  }

  function save(next: string[]) {
    setTzs(next)
    try {
      localStorage.setItem(CLOCKS_KEY, JSON.stringify(next))
    } catch {
      /* sin almacenamiento */
    }
  }

  function addClock(tz: string) {
    if (tzs.includes(tz)) return
    save([...tzs, tz])
  }
  function removeClock(tz: string) {
    if (tzs.length <= 1) return // siempre al menos un reloj
    save(tzs.filter((t) => t !== tz))
  }

  const disponibles = ZONAS.filter((z) => !tzs.includes(z.tz))

  return (
    <WidgetCard
      lado={
        <div
          className="radar-ajustes"
          ref={menuRef}
          onKeyDown={onAjustesKeyDown}
          onBlur={onAjustesBlur}
        >
          <button
            ref={ajustesBtnRef}
            type="button"
            className="push-btn"
            onClick={() => setAjustes((o) => !o)}
            aria-expanded={ajustes}
            aria-controls={ajustes ? idAjustes : undefined}
          >
            Ajustes
          </button>
          {ajustes && (
            <div className="radar-menu" id={idAjustes}>
              <div role="group" aria-labelledby={`${idAjustes}-actuales`}>
                <p className="radar-menu-title" id={`${idAjustes}-actuales`}>
                  Relojes actuales
                </p>
                {tzs.map((tz) => (
                  <div key={tz} className="clock-menu-row">
                    <span>{labelDe(tz)}</span>
                    <button
                      type="button"
                      className="clock-remove"
                      onClick={() => removeClock(tz)}
                      disabled={tzs.length <= 1}
                      aria-label={`Quitar ${labelDe(tz)}`}
                      title={tzs.length <= 1 ? 'Debe quedar al menos un reloj' : 'Quitar'}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {disponibles.length > 0 &&
                REGIONES.map((region, i) => {
                  const deRegion = disponibles.filter((z) => z.region === region)
                  if (deRegion.length === 0) return null
                  return (
                    <div key={region} role="group" aria-labelledby={`${idAjustes}-r${i}`}>
                      <p className="radar-menu-title" id={`${idAjustes}-r${i}`}>
                        {region}
                      </p>
                      {deRegion.map((z) => (
                        <button
                          key={z.tz}
                          type="button"
                          className="radar-menu-item"
                          onClick={() => addClock(z.tz)}
                        >
                          {z.label}
                        </button>
                      ))}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      }
    >
      <Relojes tzs={tzs} />
    </WidgetCard>
  )
}
