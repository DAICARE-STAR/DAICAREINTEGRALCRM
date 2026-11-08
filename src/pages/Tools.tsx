import { useEffect, useState } from 'react'
import AppIcon from '../components/AppIcon'
import CabeceraPagina from '../components/CabeceraPagina'
import { IconoHerramientas } from '../components/IconosNav'
import InfoI from '../components/InfoI'
import { SkeletonTarjetas } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { fetchActiveBrands, fetchConnectors, toolPermKey, visibleForRole } from '../lib/data'
import { useTitulo } from '../lib/useTitulo'
import type { Connector, SiteBrand } from '../types'

// Los enlaces salen de la base sin CHECK de esquema: solo http(s) llega a un
// href (React no bloquea javascript:)
function enlaceWeb(url: string | null | undefined): string | null {
  return url && /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null
}

export default function Tools() {
  useTitulo('Herramientas')
  const { profile } = useAuth()
  // null = cargando (skeleton); [] = vacío real o error
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  const [brands, setBrands] = useState<SiteBrand[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchConnectors()
      .then(setConnectors)
      .catch(() => {
        setConnectors([])
        setError(true)
      })
    // Las marcas son opcionales: si la tabla/migración no está, se omite
    fetchActiveBrands()
      .then(setBrands)
      .catch(() => setBrands([]))
  }, [])

  const visible = visibleForRole(
    connectors ?? [],
    profile?.roles ?? null,
    profile?.permissions ?? null
  )
  const categories = [...new Set(visible.map((c) => c.category ?? 'Otras'))]

  return (
    <div className="page">
      <CabeceraPagina titulo="Herramientas" icono={<IconoHerramientas size={24} />} />
      {error && (
        <p className="alert">
          No se pudieron cargar las herramientas. Revisa la conexión con Supabase.
        </p>
      )}
      {connectors === null && <SkeletonTarjetas n={6} />}
      {categories.map((cat) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <div className="grid">
            {visible
              .filter((c) => (c.category ?? 'Otras') === cat)
              .map((c) => {
                const href = enlaceWeb(c.url)
                const cuerpo = (
                  <>
                    <AppIcon icon={c.icon} clave={toolPermKey(c.name)} />
                    <strong>{c.name}</strong>
                    <span className="muted">{c.description}</span>
                  </>
                )
                // Sin enlace válido la tarjeta queda sin destino
                return href ? (
                  <a
                    key={c.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card"
                  >
                    {cuerpo}
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                ) : (
                  <div key={c.id} className="card">
                    {cuerpo}
                  </div>
                )
              })}
          </div>
        </section>
      ))}

      {brands && brands.length > 0 && (
        <section>
          <div className="titulo-info">
            <h2>Marcas representadas</h2>
            <InfoI texto="Sitio oficial y portal de descargas (catálogos, fichas técnicas, archivos IES) de cada marca." />
          </div>
          <div className="grid">
            {brands.map((b) => {
              const sitio = enlaceWeb(b.website_url)
              const descargas = enlaceWeb(b.downloads_url)
              return (
                <div key={b.id} className="brand-card">
                  <div className="brand-card-logo">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt={b.name} loading="lazy" />
                    ) : (
                      <strong>{b.name}</strong>
                    )}
                  </div>
                  <div className="brand-card-links">
                    {sitio ? (
                      <a href={sitio} target="_blank" rel="noopener noreferrer">
                        Sitio oficial
                        <span className="sr-only"> de {b.name} (se abre en otra pestaña)</span>
                      </a>
                    ) : (
                      <span className="muted small">Sin sitio</span>
                    )}
                    {descargas ? (
                      <a href={descargas} target="_blank" rel="noopener noreferrer">
                        Descargas
                        <span className="sr-only"> de {b.name} (se abre en otra pestaña)</span>
                      </a>
                    ) : (
                      <span className="muted small">Sin descargas</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
