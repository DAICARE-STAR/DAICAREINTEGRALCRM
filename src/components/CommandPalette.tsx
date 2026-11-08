import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useDialogo } from '../lib/useDialogo'
import {
  searchCrm,
  searchMembers,
  searchProjects,
  searchTenders,
  type SearchCompany,
  type SearchContact,
  type SearchMember,
  type SearchProject,
  type SearchTender,
} from '../lib/search'
import type { PortalApp } from '../types'

// Paleta de búsqueda global (Ctrl+K): navegación + proyectos + licitaciones
// + CRM + miembros. Los grupos asíncronos solo se consultan si el usuario
// tiene visible la app correspondiente (y RLS/el proxy revalidan igualmente).
//
// Es un combobox con listbox: el foco se queda en el campo, la opción activa
// se señala con aria-activedescendant y aria-selected, y cada grupo es un
// role=group con su .cmdk-grupo como nombre. useDialogo pone el foco
// inicial, la trampa de Tab, Escape y el retorno del foco a quien abrió.

interface Item {
  key: string
  group: string
  title: string
  meta: string
  to: string
}

// Sin tildes y en minúsculas, para casar "cucuta" con "Cúcuta".
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function fmtDeadline(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `cierra ${d}/${m}/${y}`
}

export default function CommandPalette({
  apps,
  onClose,
}: {
  apps: PortalApp[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { hasPerm } = useAuth()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [projects, setProjects] = useState<SearchProject[]>([])
  const [tenders, setTenders] = useState<SearchTender[]>([])
  const [members, setMembers] = useState<SearchMember[]>([])
  const [companies, setCompanies] = useState<SearchCompany[]>([])
  const [contacts, setContacts] = useState<SearchContact[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)
  const idBase = useId()
  const idLista = `${idBase}-lista`
  const idOpcion = (i: number) => `${idBase}-op-${i}`
  const { pedirCierre } = useDialogo(cajaRef, { alCerrar: onClose, focoInicial: inputRef })

  const hasApp = (slug: string) => apps.some((a) => a.slug === slug)

  // Destinos de navegación (respetando permisos ya calculados por el shell)
  const navItems = useMemo<Item[]>(() => {
    const pages: { title: string; to: string; show: boolean }[] = [
      { title: 'Inicio', to: '/', show: true },
      { title: 'Herramientas', to: '/herramientas', show: true },
      { title: 'Chat', to: '/chat', show: true },
      { title: 'Correo', to: '/correo', show: true },
      { title: 'Calendario', to: '/calendario', show: true },
      { title: 'Equipo', to: '/equipo', show: true },
      {
        title: 'Sitio web',
        to: '/sitio-web',
        show: hasPerm(['manage_blog', 'manage_brands', 'manage_projects', 'manage_notice', 'manage_leads', 'view_analytics']),
      },
      {
        title: 'Administración',
        to: '/admin',
        show: hasPerm(['manage_apps', 'manage_connectors', 'manage_members', 'manage_roles']),
      },
    ]
    return [
      ...pages
        .filter((p) => p.show)
        .map((p) => ({ key: `nav-${p.to}`, group: 'Ir a', title: p.title, meta: '', to: p.to })),
      ...apps.map((a) => ({
        key: `app-${a.slug}`,
        group: 'Ir a',
        title: a.name,
        meta: 'Aplicación',
        to: `/apps/${a.slug}`,
      })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps])

  // Búsqueda asíncrona con debounce; un contador de secuencia descarta
  // respuestas viejas que lleguen tarde (patrón del Directorio).
  useEffect(() => {
    const term = query.trim()
    const seq = ++seqRef.current
    if (term.length < 2) {
      setProjects([])
      setTenders([])
      setMembers([])
      setCompanies([])
      setContacts([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const timer = setTimeout(async () => {
      const [proj, tend, memb, crm] = await Promise.all([
        hasApp('proyectos') ? searchProjects(term) : Promise.resolve([]),
        hasApp('licitaciones') ? searchTenders(term) : Promise.resolve([]),
        searchMembers(term),
        // Los resultados abren el Directorio: sin él no se busca. searchCrm,
        // además, no llama al proxy si no ve ninguna app que lea el CRM.
        hasApp('directorio') && term.length >= 3
          ? searchCrm(term, apps.map((a) => a.slug))
          : Promise.resolve({ companies: [], contacts: [] }),
      ])
      if (seq !== seqRef.current) return
      setProjects(proj)
      setTenders(tend)
      setMembers(memb)
      setCompanies(crm.companies)
      setContacts(crm.contacts)
      setBuscando(false)
    }, 280)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const items = useMemo<Item[]>(() => {
    const q = norm(query.trim())
    const navFiltered = q
      ? navItems.filter((i) => norm(i.title).includes(q))
      : navItems
    const out: Item[] = [...navFiltered]
    for (const p of projects) {
      out.push({
        key: `proj-${p.id}`,
        group: 'Proyectos',
        title: `${p.brand} · ${p.code}`,
        // 'Listo' es el valor guardado; en pantalla se muestra «Ganado»
        meta: [p.client, p.country, p.status === 'Listo' ? 'Ganado' : p.status].filter(Boolean).join(' · '),
        to: `/apps/proyectos?proyecto=${encodeURIComponent(p.id)}`,
      })
    }
    for (const t of tenders) {
      out.push({
        key: `tend-${t.id}`,
        group: 'Licitaciones',
        title: t.title,
        meta: [t.entity, t.country, fmtDeadline(t.deadline)].filter(Boolean).join(' · '),
        to: `/apps/licitaciones?licitacion=${encodeURIComponent(t.id)}`,
      })
    }
    for (const c of companies) {
      out.push({
        key: `comp-${c.id}`,
        group: 'CRM',
        title: c.name,
        meta: ['Empresa', c.city, c.country].filter(Boolean).join(' · '),
        to: `/apps/directorio?empresa=${encodeURIComponent(c.id)}`,
      })
    }
    for (const c of contacts) {
      out.push({
        key: `cont-${c.id}`,
        group: 'CRM',
        title: c.name,
        meta: ['Contacto', c.company, c.email].filter(Boolean).join(' · '),
        to: `/apps/directorio?contacto=${encodeURIComponent(c.id)}`,
      })
    }
    for (const m of members) {
      out.push({
        key: `memb-${m.id}`,
        group: 'Equipo',
        title: m.full_name ?? 'Miembro',
        meta: '',
        to: '/equipo',
      })
    }
    return out
  }, [query, navItems, projects, tenders, companies, contacts, members])

  // Grupos consecutivos para el render, conservando el índice plano que
  // usan el teclado y aria-activedescendant
  const grupos = useMemo(() => {
    const out: { nombre: string; opciones: { item: Item; idx: number }[] }[] = []
    items.forEach((item, idx) => {
      const ultimo = out[out.length - 1]
      if (ultimo && ultimo.nombre === item.group) ultimo.opciones.push({ item, idx })
      else out.push({ nombre: item.group, opciones: [{ item, idx }] })
    })
    return out
  }, [items])

  // El índice activo nunca debe apuntar fuera de la lista vigente
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, items.length - 1)))
  }, [items])

  // La opción activa se mantiene a la vista al navegar con el teclado
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item: Item) {
    onClose()
    navigate(item.to)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (items.length ? (a + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[active]
      if (item) go(item)
    }
    // Escape lo atiende useDialogo: cierra y devuelve el foco
  }

  const activa = items[active] ? idOpcion(active) : undefined
  const estado = buscando
    ? 'Buscando…'
    : items.length > 0
      ? ''
      : query.trim().length < 2
        ? 'Escribe al menos 2 letras para buscar en todo el portal.'
        : 'Sin resultados.'

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) pedirCierre()
      }}
    >
      <div
        ref={cajaRef}
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        tabIndex={-1}
      >
        <div className="cmdk-inputrow">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={activa}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar proyectos, licitaciones, CRM, páginas…"
            aria-label="Buscar en el portal"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-results" ref={listRef}>
          <div role="listbox" id={idLista} aria-label="Resultados">
            {grupos.map((g, gi) => (
              <div key={g.nombre} role="group" aria-labelledby={`${idBase}-g-${gi}`}>
                <div className="cmdk-grupo" id={`${idBase}-g-${gi}`} role="presentation">
                  {g.nombre}
                </div>
                {g.opciones.map(({ item, idx }) => (
                  <div
                    key={item.key}
                    id={idOpcion(idx)}
                    role="option"
                    aria-selected={idx === active}
                    className="cmdk-item"
                    // El foco se queda en el campo
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(item)}
                  >
                    <span className="cmdk-title">{item.title}</span>
                    {item.meta && <span className="cmdk-meta">{item.meta}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Región viva fija: si naciera con el texto, el lector no la anuncia */}
          <div className={estado ? 'cmdk-empty' : 'sr-only'} role="status">
            {estado}
          </div>
        </div>
      </div>
    </div>
  )
}
