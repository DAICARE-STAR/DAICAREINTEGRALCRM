import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useDialogo } from '../lib/useDialogo'
import { searchMembers, type SearchMember } from '../lib/search'
import type { Modulo } from '../lib/modulos'
import { shellDe, type ResultadoBusqueda } from '../modulos'

// Paleta de búsqueda global (Ctrl+K): las páginas del núcleo y de los
// módulos visibles, los miembros y lo que busca cada módulo visible con los
// proveedores de su src/modulos/<slug>/rutas.tsx (RLS y el proxy revalidan).
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

export default function CommandPalette({
  modulos,
  onClose,
}: {
  modulos: Modulo[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { hasPerm } = useAuth()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [members, setMembers] = useState<SearchMember[]>([])
  const [deModulos, setDeModulos] = useState<Item[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)
  const idBase = useId()
  const idLista = `${idBase}-lista`
  const idOpcion = (i: number) => `${idBase}-op-${i}`
  const { pedirCierre } = useDialogo(cajaRef, { alCerrar: onClose, focoInicial: inputRef })

  // Destinos de navegación (respetando permisos ya calculados por el shell)
  const navItems = useMemo<Item[]>(() => {
    const pages: { title: string; to: string; show: boolean }[] = [
      { title: 'Inicio', to: '/', show: true },
      { title: 'Herramientas', to: '/herramientas', show: true },
      { title: 'Equipo', to: '/equipo', show: true },
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
      ...modulos.map((m) => ({
        key: `mod-${m.slug}`,
        group: 'Ir a',
        title: m.nombre,
        meta: 'Módulo',
        to: m.ruta ?? '/',
      })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulos])

  // Búsqueda asíncrona con debounce; un contador de secuencia descarta
  // respuestas viejas que lleguen tarde (patrón del Directorio).
  useEffect(() => {
    const term = query.trim()
    const seq = ++seqRef.current
    if (term.length < 2) {
      setMembers([])
      setDeModulos([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const proveedores = modulos.flatMap((m) => shellDe(m.slug)?.busquedas ?? [])
    const timer = setTimeout(async () => {
      const [memb, ...grupos] = await Promise.all([
        searchMembers(term),
        ...proveedores.map((p) =>
          term.length >= (p.minimo ?? 2)
            ? p.buscar(term).then(
                (r: ResultadoBusqueda[]) => r.map((x) => ({ ...x, key: `${p.grupo}-${x.key}`, group: p.grupo })),
                () => [] as Item[],
              )
            : Promise.resolve([] as Item[]),
        ),
      ])
      if (seq !== seqRef.current) return
      setMembers(memb)
      setDeModulos(grupos.flat())
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
    out.push(...deModulos)
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
  }, [query, navItems, deModulos, members])

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
            placeholder="Buscar páginas, miembros…"
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
