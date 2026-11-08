import changelog from '../../../CHANGELOG.md?raw'
import CabeceraAdmin from './CabeceraAdmin'

// Muestra las versiones de CHANGELOG.md (la fuente de verdad del
// versionado, en el repo): cada «## versión — fecha — título» con sus
// viñetas. La introducción del archivo (cómo se versiona) no se pinta: es
// ayuda, no novedad (GUIA-UI, sin leyendas en pantalla).
type Version = { version: string; fecha: string; titulo: string; items: string[] }

function parsear(md: string): Version[] {
  const versiones: Version[] = []
  for (const linea of md.split('\n')) {
    if (linea.startsWith('## ')) {
      const [version = '', fecha = '', titulo = ''] = linea.slice(3).split(' — ')
      versiones.push({ version, fecha, titulo, items: [] })
    } else if (linea.startsWith('- ') && versiones.length) {
      versiones[versiones.length - 1].items.push(linea.slice(2))
    }
  }
  return versiones
}

export default function NovedadesTab() {
  const versiones = parsear(changelog)
  return (
    <div>
      <CabeceraAdmin titulo="Versiones del portal" />
      {versiones.map((v) => (
        <div className="card" key={v.version} style={{ marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 2px' }}>
            <span style={{ color: 'var(--accent)' }}>{v.version}</span> — {v.titulo}
          </h3>
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            {v.fecha}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {v.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
