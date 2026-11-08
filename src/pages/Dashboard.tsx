import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import CabeceraPagina from '../components/CabeceraPagina'
import { IconoInicio } from '../components/IconosNav'
import { SkeletonWidget } from '../components/Skeleton'
import WidgetBoundary from '../components/WidgetBoundary'
import { WidgetContext } from '../components/WidgetCard'
import WorldClockWidget from '../components/WorldClockWidget'
import { useAuth } from '../context/AuthContext'
import { fetchAllWidgets, visibleForRole } from '../lib/data'
import { useArrastreWidgets } from '../lib/useArrastreWidgets'
import { useEsMovil } from '../lib/useEsMovil'
import { conTiempoLimite } from '../lib/useWidgetData'
import { useTitulo } from '../lib/useTitulo'
import { GRUPOS, WIDGETS, defWidget, esWidgetId, type WidgetId } from '../lib/widgets'
import {
  CLAVE_V1,
  CLAVE_V2,
  CLAVE_V3,
  alternar,
  leerPrefs,
  mediasSolas,
  ordenEfectivo,
  reubicar,
  serializar,
  type LecturaPrefs,
  type PrefsWidgets,
} from '../lib/widgetsPrefs'
import type { PortalWidget } from '../types'

// El inicio muestra SOLO los widgets (pedido del usuario 2026-08-15):
// las aplicaciones y herramientas viven en el menú lateral y en
// /herramientas, sin tarjetas duplicadas aquí.
//
// La DISPONIBILIDAD de los widgets para el equipo (activo, roles, orden y
// nombre, que es el título de la tarjeta) se gestiona en Administración →
// Widgets (tabla portal_widgets, migración 30); el botón «Widgets» es la
// preferencia personal de cada quien sobre los disponibles: cuáles ve; el
// orden lo arma cada quien arrastrando las tarjetas por su asa
// (lib/widgetsPrefs.ts, lib/useArrastreWidgets.ts). Sin la migración
// aplicada, todos quedan disponibles en el orden del código. La lista de
// widgets está en lib/widgets.ts. Grilla de dos columnas cuando caben
// (styles.css, «inicio: grilla de widgets»).

// Componente que pinta cada widget (cada uno se oculta solo si no hay
// datos o falta permiso)
// Los widgets de cada módulo llegan con su módulo (docs/origen.md)
const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  clock: WorldClockWidget,
}

const IDS: readonly string[] = WIDGETS.map((w) => w.id)

interface Disponible {
  id: WidgetId
  label: string
  grupo: string
  ancho: boolean
}

function leerAlmacen(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function cargarPrefs(): LecturaPrefs {
  return leerPrefs(leerAlmacen(CLAVE_V3), leerAlmacen(CLAVE_V2), leerAlmacen(CLAVE_V1), IDS)
}

// Hasta que la persona acomoda una tarjeta su orden sigue siendo por grupo
// y se guarda como v2 (ocultar o mostrar no lo cambia de versión)
function guardarPrefs(prefs: PrefsWidgets & { version?: number }) {
  try {
    localStorage.setItem(prefs.version === 3 ? CLAVE_V3 : CLAVE_V2, serializar(prefs))
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
}

function conDefinicion(w: { id: WidgetId; label: string }): Disponible {
  const def = defWidget(w.id)
  return { ...w, grupo: def.grupo, ancho: !!def.ancho }
}

function BotonOrden({
  dir,
  nombre,
  clave,
  deshabilitado,
  onMover,
}: {
  dir: -1 | 1
  nombre: string
  clave: string
  deshabilitado: boolean
  onMover: () => void
}) {
  return (
    <button
      type="button"
      className="widgets-orden-btn"
      data-mover={clave}
      aria-label={`${dir < 0 ? 'Subir' : 'Bajar'} ${nombre}`}
      aria-disabled={deshabilitado || undefined}
      onClick={() => {
        if (!deshabilitado) onMover()
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d={dir < 0 ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
      </svg>
    </button>
  )
}

export default function Dashboard() {
  const { profile, session } = useAuth()
  const [prefs, setPrefs] = useState<LecturaPrefs>(cargarPrefs)
  const [widgetMenu, setWidgetMenu] = useState(false)
  // Configuración del equipo (Administración → Widgets): undefined =
  // cargando (todavía no se monta ningún widget), null = sin tabla
  const [widgetConfig, setWidgetConfig] = useState<PortalWidget[] | null | undefined>(undefined)
  // Flecha Subir/Bajar que debe conservar el foco tras mover su tarjeta
  const [foco, setFoco] = useState<string | null>(null)
  // Región viva: posición al mover una tarjeta
  const [anuncio, setAnuncio] = useState('')
  const anuncioTimer = useRef<number>()
  const widgetMenuRef = useRef<HTMLDivElement>(null)
  const widgetBtnRef = useRef<HTMLButtonElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const esMovil = useEsMovil()

  useTitulo('Inicio')
  useEffect(() => () => window.clearTimeout(anuncioTimer.current), [])

  // Vaciar y reescribir: el lector repite un anuncio aunque sea igual al anterior
  function anunciar(texto: string) {
    setAnuncio('')
    window.clearTimeout(anuncioTimer.current)
    anuncioTimer.current = window.setTimeout(() => setAnuncio(texto), 50)
  }

  useEffect(() => {
    // Si la migración 30 no está aplicada, falla o no responde a tiempo, se
    // sigue con todos los widgets (cada uno se oculta si no le toca)
    let vivo = true
    void conTiempoLimite(fetchAllWidgets()).then((c) => {
      if (vivo) setWidgetConfig(c)
    })
    return () => {
      vivo = false
    }
  }, [])

  // Otra pestaña cambió la preferencia: se relee. El evento no llega a la
  // pestaña que escribe y releer no guarda, así que no hay ida y vuelta
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key === CLAVE_V2 || e.key === CLAVE_V3) setPrefs(cargarPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // El menú de widgets se cierra al hacer clic fuera
  useEffect(() => {
    if (!widgetMenu) return
    function onDown(e: MouseEvent) {
      if (widgetMenuRef.current && !widgetMenuRef.current.contains(e.target as Node)) {
        setWidgetMenu(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [widgetMenu])

  // Al mover una tarjeta, React reinserta su nodo y la flecha pierde el
  // foco: se le devuelve
  // Se aplica una sola vez: si quedara puesto, un movimiento posterior con el
  // asa le robaría el foco y lo cancelaría
  useEffect(() => {
    if (!foco) return
    areaRef.current?.querySelector<HTMLButtonElement>(`[data-mover="${foco}"]`)?.focus()
    setFoco(null)
  }, [foco])

  // Escape (en el botón o dentro del menú) lo cierra y devuelve el foco al botón
  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!widgetMenu || (e.key !== 'Escape' && e.key !== 'Esc')) return
    e.preventDefault()
    e.stopPropagation()
    setWidgetMenu(false)
    widgetBtnRef.current?.focus()
  }

  // Si el foco sale a otro control (Tab), el menú se cierra para no taparlo.
  // Sin destino (clic en algo no enfocable, otra ventana) lo atiende el
  // mousedown de arriba.
  function onMenuBlur(e: FocusEvent<HTMLDivElement>) {
    const destino = e.relatedTarget as Node | null
    if (widgetMenu && destino && !e.currentTarget.contains(destino)) setWidgetMenu(false)
  }

  function actualizar(cambio: (p: LecturaPrefs) => Partial<LecturaPrefs>) {
    setPrefs((p) => {
      const next = { ...p, ...cambio(p) }
      guardarPrefs(next)
      return next
    })
  }

  const role = profile?.roles ?? null
  const cargando = widgetConfig === undefined

  // Widgets disponibles para este usuario según la configuración del
  // equipo (activo + roles), en el orden administrado y luego el personal.
  // Sin configuración (migración 30 pendiente o error): todos, en el orden
  // del código.
  const base: { id: WidgetId; label: string }[] = widgetConfig
    ? visibleForRole(
        widgetConfig.filter((w) => w.active && esWidgetId(w.id)),
        role,
        profile?.permissions ?? null
      ).map((w) => ({
        id: w.id as WidgetId,
        label: w.name || defWidget(w.id as WidgetId).label,
      }))
    : WIDGETS.map((w) => ({ id: w.id, label: w.label }))
  const disponibles = ordenEfectivo(base.map(conDefinicion), prefs)
  const oculto = (id: string) => prefs.ocultos.includes(id)
  const visibles = disponibles.filter((w) => !oculto(w.id))
  const idsVisibles = visibles.map((w) => w.id)
  // Lo que se guarda al reubicar cubre TODOS los widgets de la configuración
  // (también los inactivos o de otro rol): así, si alguien pierde un rol un
  // tiempo, el administrador desactiva uno o se comparte el navegador, cada
  // widget conserva su sitio y no vuelve al final de la página
  const efectivo = ordenEfectivo(
    (widgetConfig
      ? widgetConfig
          .filter((w) => esWidgetId(w.id))
          .map((w) => ({ id: w.id as WidgetId, label: defWidget(w.id as WidgetId).label }))
      : WIDGETS.map((w) => ({ id: w.id, label: w.label }))
    ).map(conDefinicion),
    prefs
  ).map((w) => w.id)

  // Reubicar fija el orden completo (v3): solo con la configuración y el
  // perfil cargados, para mostrar las tarjetas reales de esa persona
  const puedeReubicar = Array.isArray(widgetConfig) && profile != null

  const arrastre = useArrastreWidgets<LecturaPrefs>({
    area: areaRef,
    ids: idsVisibles,
    nombre: (id) => visibles.find((w) => w.id === id)?.label ?? id,
    mover: (id, destino, guardar) =>
      setPrefs((p) => {
        const next: LecturaPrefs = { ...p, version: 3, orden: reubicar(efectivo, idsVisibles, id, destino) }
        if (guardar) guardarPrefs(next)
        return next
      }),
    confirmar: () => guardarPrefs(prefs),
    foto: () => prefs,
    restaurar: (f) => setPrefs(f),
    anunciar,
  })

  // Sin dense, una media columna sola antes de un ancho (o al final) deja
  // un hueco: va a lo ancho. Cuenta lo que se pinta (un widget sin datos no
  // ocupa sitio), en el orden de este render; antes de la primera lectura
  // del DOM, todos los visibles
  const pintados = new Set(arrastre.pintados)
  const solas = new Set(
    mediasSolas(pintados.size ? visibles.filter((w) => pintados.has(w.id)) : visibles)
  )

  // En escritorio, el asa (puntero y teclado) y además Subir/Bajar, que
  // solo se ven al llegar con Tab: con lector de pantalla en modo
  // exploración las flechas no llegan al asa. En el celular, solo Subir/Bajar.
  function asaDe(w: Disponible) {
    if (!puedeReubicar) return null
    const i = arrastre.pintados.indexOf(w.id)
    const paso = (dir: -1 | 1) => {
      setFoco(`${w.id}:${dir}`)
      arrastre.moverPaso(w.id, dir, true)
    }
    const flechas = (
      <span className="widget-orden">
        <BotonOrden
          dir={-1}
          nombre={w.label}
          clave={`${w.id}:-1`}
          deshabilitado={i <= 0}
          onMover={() => paso(-1)}
        />
        <BotonOrden
          dir={1}
          nombre={w.label}
          clave={`${w.id}:1`}
          deshabilitado={i < 0 || i === arrastre.pintados.length - 1}
          onMover={() => paso(1)}
        />
      </span>
    )
    if (esMovil) return flechas
    return (
      <>
        <button
          type="button"
          className="widgets-orden-btn widget-asa"
          aria-label={`Mover ${w.label}`}
          aria-describedby="widgets-asa-ayuda"
          {...arrastre.propsAsa(w.id)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        {flechas}
      </>
    )
  }

  return (
    <div className="page widgets-page">
      <CabeceraPagina
        titulo={`Hola, ${profile?.full_name ?? session?.user.email ?? 'bienvenido/a'}`}
        icono={<IconoInicio size={24} />}
      >
        <div
          className="widgets-config"
          ref={widgetMenuRef}
          onKeyDown={onMenuKeyDown}
          onBlur={onMenuBlur}
        >
          <button
            ref={widgetBtnRef}
            type="button"
            className="btn-ghost btn-small"
            aria-expanded={widgetMenu}
            aria-controls={widgetMenu ? 'widgets-menu' : undefined}
            onClick={() => setWidgetMenu((o) => !o)}
          >
            Widgets
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
              style={{ marginLeft: 4 }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {widgetMenu && (
            <div className="widgets-menu" id="widgets-menu">
              {GRUPOS.map((grupo) => {
                const delGrupo = disponibles.filter((w) => w.grupo === grupo)
                if (delGrupo.length === 0) return null
                return (
                  <fieldset key={grupo}>
                    <legend className="widgets-menu-grupo">{grupo}</legend>
                    {delGrupo.map((w) => (
                      <div key={w.id} className="widgets-menu-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={!oculto(w.id)}
                            onChange={() => actualizar((p) => alternar(p, w.id))}
                          />
                          {w.label}
                        </label>
                      </div>
                    ))}
                  </fieldset>
                )
              })}
              {disponibles.length === 0 && (
                <span className="muted small">No hay widgets disponibles para tu rol.</span>
              )}
            </div>
          )}
        </div>
      </CabeceraPagina>

      <div className="widgets-area" ref={areaRef}>
        {/* Mientras llega la configuración del equipo: esqueleto (a los
            300 ms), sin montar ningún widget */}
        {cargando && <SkeletonWidget />}
        {!cargando &&
          visibles.map((w) => {
            const Componente = WIDGET_COMPONENTS[w.id]
            return (
              <WidgetContext.Provider
                key={w.id}
                value={{ id: w.id, nombre: w.label, ancho: w.ancho || solas.has(w.id), asa: asaDe(w) }}
              >
                <WidgetBoundary id={w.id}>
                  <Componente />
                </WidgetBoundary>
              </WidgetContext.Provider>
            )
          })}
      </div>
      {/* Mientras cargan, los widgets pintan su skeleton; los que no tienen
          datos o permiso se ocultan solos. Si todos lo hicieron, el área
          queda vacía y el CSS muestra este mensaje */}
      {!cargando && visibles.length > 0 && (
        <p className="muted widgets-vacio">Sin datos en tus widgets por ahora.</p>
      )}
      {!cargando && disponibles.length > 0 && visibles.length === 0 && (
        <p className="muted">
          Todos los widgets están ocultos. Actívalos desde el botón «Widgets».
        </p>
      )}
      {!cargando && disponibles.length === 0 && (
        <p className="muted">
          No hay widgets disponibles para tu rol. Se gestionan en
          Administración → Widgets.
        </p>
      )}
      <p id="widgets-asa-ayuda" className="sr-only">
        Espacio toma el widget, las flechas lo mueven, Espacio lo suelta y Escape cancela.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </p>
    </div>
  )
}
