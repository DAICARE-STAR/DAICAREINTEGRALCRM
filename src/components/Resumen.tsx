import { contextoDestacado, cuentasVisibles, valoresDestacado, type Cuenta, type Destacado } from '../lib/resumen'

// Resumen de dos niveles (resumen.js de team-portal): una cifra destacada y
// los contadores que suman el total; los que están en cero no se pintan. Un
// contador con filtro es un botón con aria-pressed que aplica o suelta ese
// filtro (alFiltrar recibe 'id|valor').

interface Props {
  destacado: Destacado
  cuentas: Cuenta[]
  alFiltrar?: (par: string) => void
}

export default function Resumen({ destacado, cuentas, alFiltrar }: Props) {
  const ctx = contextoDestacado(destacado)
  return (
    <div className="resumen">
      <div className="res-destacado">
        <span className="rd-label">{destacado.label}</span>
        <span className="rd-valor">
          {valoresDestacado(destacado).map((v, i) => (
            <i key={i}>{v}</i>
          ))}
        </span>
        {ctx.length > 0 && (
          <span className="rd-ctx">
            {ctx.map((t, i) => (
              <i key={i}>{t}</i>
            ))}
          </span>
        )}
      </div>
      <div className="res-cuentas">
        {cuentasVisibles(cuentas).map((c) => {
          const cuerpo = (
            <>
              <b>{c.n}</b>
              <span>{c.label}</span>
              {c.sub && <span className="sub">{c.sub}</span>}
            </>
          )
          const par = c.filtro
          if (!par || !alFiltrar) {
            return (
              <span key={c.label} className="cuenta">
                {cuerpo}
              </span>
            )
          }
          return (
            <button
              key={c.label}
              type="button"
              className={`cuenta${c.activa ? ' on' : ''}`}
              aria-pressed={!!c.activa}
              onClick={() => alFiltrar(par)}
            >
              {cuerpo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
