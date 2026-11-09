import { fmtDinero } from '../lib/moneda'

// Un importe con el formato del shell («USD $ 1.234»). Varias divisas se
// apilan, nunca se suman (GUIA-UI.md, «Dinero»).

interface Props {
  valor?: unknown
  moneda?: string | null
  decimales?: number
  /** Importes en varias divisas: uno por línea. */
  montos?: { valor: unknown; moneda: string }[]
}

export default function Dinero({ valor, moneda, decimales = 0, montos }: Props) {
  if (montos && montos.length) {
    return (
      <span className="dinero dinero-apilado">
        {montos.map((m) => (
          <span key={m.moneda}>{fmtDinero(m.valor, m.moneda, decimales)}</span>
        ))}
      </span>
    )
  }
  return <span className="dinero">{fmtDinero(valor, moneda, decimales)}</span>
}
