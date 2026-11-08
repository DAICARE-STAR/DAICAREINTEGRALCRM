import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import AppIcon from './AppIcon'
import Avatar from './Avatar'
import BackToTop from './BackToTop'
import CabeceraMarco from './CabeceraMarco'
import CommandPalette from './CommandPalette'
import EditProfileModal from './EditProfileModal'
import {
  IconoAdministracion,
  IconoEquipo,
  IconoHerramientas,
  IconoInicio,
} from './IconosNav'
import NotifBell from './NotifBell'
import MfaModal from './MfaModal'
import { usePush } from '../lib/usePush'
import PasswordModal from './PasswordModal'
import RightRail from './RightRail'
import { Cargando, Skeleton } from './Skeleton'
import UsoLatido from './UsoLatido'
import { useAuth } from '../context/AuthContext'
import { CabeceraProvider, type DatosCabecera } from '../context/CabeceraContext'
import { NotificationsProvider } from '../context/NotificationsContext'
import { PresenceProvider } from '../context/PresenceContext'
import { rutaDeCabecera, type ModuloRuta } from '../lib/cabeceraMarco'
import { fetchApps, manualesPendientes, visibleForRole } from '../lib/data'
import { indiceSiguiente } from '../lib/teclado'
import { useDialogo } from '../lib/useDialogo'
import { useEsMovil } from '../lib/useEsMovil'
import { NOMBRE_PORTAL } from '../lib/instalacion'
import type { PortalApp } from '../types'

const NAV_STATE_KEY = 'pt_nav_open_v1'

// Icono de cada módulo en la cabecera de respaldo del marco: el mismo que
// pinta su página (24 px)
// Chat, Correo y Calendario llegan con su módulo
const ICONO_MODULO: Partial<Record<ModuloRuta, ReactNode>> = {
  inicio: <IconoInicio size={24} />,
  herramientas: <IconoHerramientas size={24} />,
  equipo: <IconoEquipo size={24} />,
  'sitio-web': <AppIcon icon={null} clave="sitio-web" size="lg" />,
  admin: <IconoAdministracion size={24} />,
}

// Barra lateral contraída a solo iconos; la elección se recuerda en este
// navegador ('1' = contraída). Sin almacenamiento, solo estado en memoria.
function usePreferenciaCompacta(clave: string): [boolean, () => void] {
  const [compacta, setCompacta] = useState(() => {
    try {
      return localStorage.getItem(clave) === '1'
    } catch {
      return false
    }
  })
  function alternar() {
    setCompacta((c) => {
      try {
        localStorage.setItem(clave, c ? '0' : '1')
      } catch {
        /* sin almacenamiento: solo estado en memoria */
      }
      return !c
    })
  }
  return [compacta, alternar]
}

// Ítems activos del menú de usuario, en orden (los deshabilitados no se
// recorren con las flechas)
function itemsDelMenu(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])
}

// Sección colapsable del menú; recuerda su estado en este navegador. La
// sección de la ruta activa se abre sola al entrar en ella (si después se
// pliega a mano, se respeta). Con el menú contraído (solo iconos) no hay
// título y todos los ítems quedan a la vista.
function NavSection({
  id,
  title,
  activa = false,
  compacta = false,
  children,
}: {
  id: string
  title: string
  activa?: boolean
  compacta?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => {
    if (activa) return true
    try {
      const s = JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}')
      return s[id] !== false
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (activa) setOpen(true)
  }, [activa])

  function toggle() {
    setOpen((o) => {
      const next = !o
      try {
        const s = JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}')
        s[id] = next
        localStorage.setItem(NAV_STATE_KEY, JSON.stringify(s))
      } catch {
        /* sin almacenamiento: solo estado en memoria */
      }
      return next
    })
  }

  const mostrar = compacta || open
  return (
    <div className="nav-section">
      {!compacta && (
        <button type="button" className="nav-toggle" onClick={toggle} aria-expanded={open}>
          <span>{title}</span>
          <svg
            className={`nav-caret ${open ? 'open' : ''}`}
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      {mostrar && <div className="nav-items">{children}</div>}
    </div>
  )
}

export default function Layout() {
  const { profile, session, signOut, hasPerm } = useAuth()
  const { pathname } = useLocation()
  // null = cargando (skeleton en el menú); [] = sin apps o error
  const [apps, setApps] = useState<PortalApp[] | null>(null)
  // Aviso persistente hasta confirmar la lectura de los manuales vigentes
  // (la app Manuales avisa por postMessage al confirmar, sin recargar)
  const [manualesPend, setManualesPend] = useState(false)
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    let vivo = true
    const revisar = () => {
      void manualesPendientes(uid).then((p) => {
        if (vivo) setManualesPend(p)
      })
    }
    revisar()
    const oir = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.tipo === 'ld-manual-leido') revisar()
    }
    window.addEventListener('message', oir)
    return () => {
      vivo = false
      window.removeEventListener('message', oir)
    }
  }, [session?.user?.id])
  // Menú lateral en móvil (≤760px): cerrado por defecto, se abre con la
  // hamburguesa del topbar y se cierra al navegar, con Escape o al tocar el
  // fondo. Cerrado queda inert (ni Tab ni el lector entran); abierto, el
  // foco va al primer enlace, Tab no sale y al cerrar vuelve a la hamburguesa.
  const [navOpen, setNavOpen] = useState(false)
  const esMovil = useEsMovil()
  // Barras contraídas a solo iconos (escritorio). En móvil manda el cajón:
  // la preferencia del menú se guarda pero no se aplica.
  const [menuCompactoPref, alternarMenu] = usePreferenciaCompacta('pt_menu_compacto_v1')
  const [railCompacta, alternarRail] = usePreferenciaCompacta('pt_rail_compacta_v1')
  const menuCompacto = menuCompactoPref && !esMovil
  const asideRef = useRef<HTMLElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Abierto con el teclado: a qué ítem va el foco
  const [focoMenu, setFocoMenu] = useState<'primero' | 'ultimo' | null>(null)
  const userBtnRef = useRef<HTMLButtonElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [pwdModal, setPwdModal] = useState(false)
  const [mfaModal, setMfaModal] = useState(false)
  // Avisos push del navegador: sirven para leads, reuniones y radar, así
  // que viven aquí y no dentro de un widget concreto del inicio.
  const { estado: push, activar: activarPush, desactivar: desactivarPush } = usePush()
  const [profileModal, setProfileModal] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchApps()
      .then(setApps)
      .catch(() => setApps([]))
  }, [])

  // Ctrl+K / Cmd+K abre la búsqueda global desde cualquier página
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Cajón móvil cerrado: inert. Va antes que useDialogo para que, al abrir,
  // el inert ya no esté cuando busca el primer enlace. Abierto, lo inerte es
  // el fondo: el main y el topbar salvo la hamburguesa (el retorno del foco,
  // en diferido, ya la encuentra sin inert).
  useLayoutEffect(() => {
    asideRef.current?.toggleAttribute('inert', esMovil && !navOpen)
    const fondo = esMovil && navOpen
    mainRef.current?.toggleAttribute('inert', fondo)
    topbarRef.current?.querySelectorAll(':scope > *').forEach((el) => {
      if (el !== burgerRef.current) el.toggleAttribute('inert', fondo)
    })
  }, [esMovil, navOpen])

  // Foco inicial, trampa de Tab, Escape y retorno a la hamburguesa
  useDialogo(asideRef, {
    alCerrar: () => setNavOpen(false),
    activo: navOpen && esMovil,
    focoInicial: 'nav a',
    retorno: burgerRef,
  })

  // Mientras el cajón está abierto el fondo no se desplaza (evita el
  // «scroll fantasma» detrás del menú en móvil)
  useEffect(() => {
    if (!navOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [navOpen])

  // Al pasar a escritorio el cajón deja de existir
  useEffect(() => {
    if (!esMovil) setNavOpen(false)
  }, [esMovil])

  // Cambio de ruta: se cierra el cajón y el foco va al contenido (main), así
  // el lector empieza por la página nueva. No en la primera carga, ni al
  // cambiar de sección dentro de Administración (el foco sigue en su menú).
  const rutaPrevia = useRef(pathname)
  useEffect(() => {
    if (rutaPrevia.current === pathname) return
    const enAdmin = (r: string) => r === '/admin' || r.startsWith('/admin/')
    const mismaPagina = enAdmin(rutaPrevia.current) && enAdmin(pathname)
    rutaPrevia.current = pathname
    setNavOpen(false)
    if (!mismaPagina) mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  // Menú de usuario abierto con el teclado: foco al primer o último ítem
  useEffect(() => {
    if (!userMenuOpen || !focoMenu) return
    const items = itemsDelMenu(userMenuRef.current)
    ;(focoMenu === 'primero' ? items[0] : items[items.length - 1])?.focus()
    setFocoMenu(null)
  }, [userMenuOpen, focoMenu])

  // Flechas, Inicio y Fin recorren los ítems; Escape cierra y vuelve al
  // botón; Tab cierra y sigue su camino
  function teclaMenu(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Reclamado: el Escape no cierra también el cajón móvil
      e.preventDefault()
      setUserMenuOpen(false)
      userBtnRef.current?.focus()
      return
    }
    if (e.key === 'Tab') {
      // El ítem desaparece: Tab sigue desde el botón del menú
      userBtnRef.current?.focus()
      setUserMenuOpen(false)
      return
    }
    const items = itemsDelMenu(userMenuRef.current)
    const actual = items.indexOf(document.activeElement as HTMLElement)
    const j = indiceSiguiente(actual, items.length, e.key, 'vertical')
    if (j === null) return
    e.preventDefault()
    items[j].focus()
  }

  function teclaBotonUsuario(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && userMenuOpen) {
      e.preventDefault()
      setUserMenuOpen(false)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    setUserMenuOpen(true)
    setFocoMenu(e.key === 'ArrowDown' ? 'primero' : 'ultimo')
  }

  // Los modales del menú: el velo (z 50) queda bajo el cajón móvil (z 60),
  // así que el cajón se cierra antes de abrirlos. El ítem pulsado desaparece:
  // el foco pasa antes a quien queda a la vista (el botón de usuario, o la
  // hamburguesa en móvil), y el modal lo devuelve ahí al cerrarse.
  function abrirDesdeMenu(abrir: () => void) {
    ;(esMovil ? burgerRef : userBtnRef).current?.focus()
    setUserMenuOpen(false)
    setNavOpen(false)
    abrir()
  }

  // Cierra el menú de usuario al hacer clic fuera de él
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const visibleApps = visibleForRole(apps ?? [], profile?.roles ?? null, profile?.permissions ?? null)
  // Sección del menú que contiene la ruta activa
  const en = (...rutas: string[]) =>
    rutas.some((r) => (r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(`${r}/`)))
  // Con el menú contraído el nombre del enlace solo se ve como tooltip
  const tooltip = (texto: string) => (menuCompacto ? texto : undefined)
  const canManageSite = hasPerm(['manage_blog', 'manage_brands', 'manage_projects', 'manage_notice', 'manage_leads', 'view_analytics'])
  const isManager = hasPerm([
    'manage_apps',
    'manage_connectors',
    'manage_members',
    'manage_roles',
  ])

  // Cabecera del marco mientras la página aún no registró la suya: el título
  // conocido de la ruta (de una app, el de la lista del menú), nunca el de la
  // página anterior. Sin él, el marco muestra un esqueleto.
  const ruta = rutaDeCabecera(pathname)
  let respaldo: DatosCabecera | null = null
  if (ruta && 'app' in ruta) {
    const app = visibleApps.find((a) => a.slug === ruta.app)
    if (app) respaldo = { titulo: app.name, icono: <AppIcon icon={app.icon} clave={app.slug} size="lg" /> }
  } else if (ruta) {
    respaldo = { titulo: ruta.titulo, icono: ICONO_MODULO[ruta.modulo] }
  }

  return (
    <PresenceProvider>
      <UsoLatido />
      <NotificationsProvider>
      <CabeceraProvider>
      <div
        className={`shell${menuCompacto ? ' menu-compacto' : ''}${railCompacta ? ' rail-compacta' : ''}`}
      >
        {/* Primer Tab de la página. Sin hash en la URL: el foco va a main */}
        <a
          href="#contenido"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault()
            mainRef.current?.focus()
          }}
        >
          Saltar al contenido
        </a>
        <header className="mobile-topbar" ref={topbarRef}>
          <button
            ref={burgerRef}
            type="button"
            className="nav-burger"
            aria-label="Abrir menú"
            aria-expanded={navOpen}
            aria-controls="menu-principal"
            onClick={() => setNavOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <img src="/brand/logo-banner-transp-440.png" alt={NOMBRE_PORTAL} className="mobile-logo" width={60} height={30} />
          <button
            type="button"
            className="nav-burger topbar-search"
            aria-label="Buscar en el portal"
            onClick={() => setSearchOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <NotifBell />
        </header>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <aside
          ref={asideRef}
          id="menu-principal"
          className={`sidebar ${navOpen ? 'open' : ''}`}
          aria-label="Menú principal"
          onClick={(e) => {
            // Navegar desde el menú en móvil lo cierra solo
            if ((e.target as HTMLElement).closest('a')) setNavOpen(false)
          }}
        >
          <div className="brand">
            <img
              src={menuCompacto ? '/brand/logo-icon.png' : '/brand/logo-banner-transp-440.png'}
              alt={NOMBRE_PORTAL}
              width={menuCompacto ? 36 : 180}
              height={menuCompacto ? 36 : 90}
            />
            {!esMovil && (
              <button
                type="button"
                className="barra-toggle"
                aria-label={menuCompacto ? 'Expandir el menú' : 'Contraer el menú'}
                aria-expanded={!menuCompacto}
                onClick={alternarMenu}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={menuCompacto ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
                </svg>
              </button>
            )}
          </div>

          <button
            type="button"
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar en el portal (Ctrl+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span>Buscar</span>
            <kbd>Ctrl K</kbd>
          </button>

          <nav>
            <NavSection
              id="general"
              title="General"
              activa={en('/', '/herramientas')}
              compacta={menuCompacto}
            >
              <NavLink to="/" end title={tooltip('Inicio')}>
                <IconoInicio />
                <span className="nav-label">Inicio</span>
              </NavLink>
              <NavLink to="/herramientas" title={tooltip('Herramientas')}>
                <IconoHerramientas />
                <span className="nav-label">Herramientas</span>
              </NavLink>
            </NavSection>

            <NavSection
              id="comunicacion"
              title="Comunicación"
              activa={en('/equipo')}
              compacta={menuCompacto}
            >
              <NavLink to="/equipo" title={tooltip('Equipo')}>
                <IconoEquipo />
                <span className="nav-label">Equipo</span>
              </NavLink>
            </NavSection>

            {(canManageSite || apps === null || visibleApps.length > 0) && (
              <NavSection
                id="apps"
                title="Aplicaciones"
                activa={en('/sitio-web', '/apps')}
                compacta={menuCompacto}
              >
                {canManageSite && (
                  <NavLink to="/sitio-web" className="nav-app" title={tooltip('Sitio web')}>
                    <AppIcon icon={null} clave="sitio-web" size="sm" />
                    <span className="nav-app-name">Sitio web</span>
                  </NavLink>
                )}
                {apps === null && (
                  <Cargando etiqueta="Cargando aplicaciones" anunciar={false}>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="nav-skel">
                        <Skeleton variante="circulo" />
                        <Skeleton />
                      </div>
                    ))}
                  </Cargando>
                )}
                {visibleApps.map((app) => (
                  <NavLink
                    key={app.id}
                    to={`/apps/${app.slug}`}
                    className="nav-app"
                    title={tooltip(app.name)}
                  >
                    <AppIcon icon={app.icon} clave={app.slug} size="sm" />
                    <span className="nav-app-name">{app.name}</span>
                  </NavLink>
                ))}
              </NavSection>
            )}

            {isManager && (
              <NavSection id="sistema" title="Sistema" activa={en('/admin')} compacta={menuCompacto}>
                <NavLink to="/admin" title={tooltip('Administración')}>
                  <IconoAdministracion />
                  <span className="nav-label">Administración</span>
                </NavLink>
              </NavSection>
            )}
          </nav>

          <div className="sidebar-footer" ref={footerRef}>
            {userMenuOpen && (
              <div
                ref={userMenuRef}
                id="menu-usuario"
                className="user-menu"
                role="menu"
                aria-label="Cuenta"
                onKeyDown={teclaMenu}
              >
                <button
                  type="button"
                  className="user-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => abrirDesdeMenu(() => setProfileModal(true))}
                >
                  Editar perfil
                </button>
                <button
                  type="button"
                  className="user-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => abrirDesdeMenu(() => setPwdModal(true))}
                >
                  Cambiar contraseña
                </button>
                <button
                  type="button"
                  className="user-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => abrirDesdeMenu(() => setMfaModal(true))}
                >
                  Verificación en dos pasos
                </button>
                {push !== 'unsupported' && <div role="separator" />}
                {push !== 'unsupported' && (
                  <button
                    type="button"
                    className="user-menu-item"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={push === 'working' || push === 'denied'}
                    title={
                      push === 'denied'
                        ? 'Las notificaciones están bloqueadas para este sitio en la configuración del navegador'
                        : 'Avisos de leads, reuniones y licitaciones en este dispositivo'
                    }
                    onClick={() => void (push === 'on' ? desactivarPush() : activarPush())}
                  >
                    {push === 'on' && 'Desactivar avisos en este dispositivo'}
                    {push === 'off' && 'Activar avisos en este dispositivo'}
                    {push === 'working' && 'Configurando avisos…'}
                    {push === 'denied' && 'Avisos bloqueados por el navegador'}
                  </button>
                )}
                <div role="separator" />
                <button
                  type="button"
                  className="user-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => void signOut()}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
            <button
              ref={userBtnRef}
              type="button"
              className="user-btn"
              onClick={(e) => {
                const abrir = !userMenuOpen
                setUserMenuOpen(abrir)
                // Enter o Espacio (clic sin puntero): el foco entra en el menú
                if (abrir && e.detail === 0) setFocoMenu('primero')
              }}
              onKeyDown={teclaBotonUsuario}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              aria-controls={userMenuOpen ? 'menu-usuario' : undefined}
            >
              <Avatar
                url={profile?.avatar_url ?? null}
                name={profile?.full_name ?? null}
                email={session?.user.email}
                size={34}
              />
              <span className="user-btn-info">
                <strong>{profile?.full_name ?? session?.user.email ?? 'Usuario'}</strong>
                <span className={`role role-${profile?.role ?? 'member'}`}>
                  {profile?.role ?? 'member'}
                </span>
              </span>
              <svg
                className={`nav-caret ${userMenuOpen ? 'open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          </div>
        </aside>

        <main className="content" id="contenido" ref={mainRef} tabIndex={-1}>
          {/* Cabecera fija del marco: no se desmonta al navegar; la alimenta
              cada página con <CabeceraPagina> */}
          <CabeceraMarco respaldo={respaldo} />
          {manualesPend && (
            <NavLink to="/apps/manuales" className="manuales-aviso">
              Manuales del portal pendientes de leer — confirma tu lectura aquí
            </NavLink>
          )}
          <Outlet />
        </main>

        {/* Entre 761 y 1180 px la barra derecha está oculta y el topbar
            móvil aún no aparece: sin esta campana no habría NINGÚN sitio
            donde ver las notificaciones. */}
        <div className="notif-bell-float">
          <NotifBell />
        </div>
        <RightRail compacta={railCompacta} alAlternar={alternarRail} />
        <BackToTop />
      </div>
      </CabeceraProvider>
      </NotificationsProvider>
      {pwdModal && <PasswordModal onClose={() => setPwdModal(false)} />}
      {mfaModal && <MfaModal onClose={() => setMfaModal(false)} />}
      {profileModal && <EditProfileModal onClose={() => setProfileModal(false)} />}
      {searchOpen && (
        <CommandPalette apps={visibleApps} onClose={() => setSearchOpen(false)} />
      )}
    </PresenceProvider>
  )
}
