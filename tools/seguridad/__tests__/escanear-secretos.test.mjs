// Escáner de secretos (copia adaptada de team-portal, ver docs/origen.md):
// detecta los patrones de credenciales, no da falsos positivos con referencias, ejemplos ni prosa, y
// nunca imprime el valor. Los secretos de prueba se arman al correr (este
// archivo no lleva ninguno literal).
import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escanearArchivos, escanearTexto, leerArgumentos, listarArchivos, main, raizDelRepo } from '../escanear-secretos.mjs'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (rol) => [b64({ alg: 'HS256', typ: 'JWT' }), b64({ iss: 'supabase', ref: 'abcdefghijklmnop', role: rol }), 'Qk3mZp9LxW2vRt7yNc5bHd8sJf4gTa6e'].join('.')
// Valores con cifras y símbolos, sin palabras de ejemplo
const CLAVE = ['Hk29', 'xQp!', '7Lm'].join('-')
const TOKEN = ['aB3dE5fG', '7hI9jK1l', 'M3nO5pQ7'].join('')

const tipos = (texto, ruta = 'archivo.env') => escanearTexto(texto, ruta).map((h) => h.tipo)

describe('escanear-secretos: patrones de credenciales', () => {
  it.each([
    ['JWT de la service role', `SUPABASE_SERVICE_ROLE_KEY=${jwt('service_role')}`, 'jwt'],
    ['clave sb_secret_', `CLAVE_STORAGE=${'sb_' + 'secret_' + TOKEN}`, 'clave-sb-secret'],
    ['url de postgres con contraseña', `DB=postgresql://postgres.ref:${CLAVE}@aws-0.pooler.supabase.com:5432/postgres`, 'url-con-credenciales'],
    ['asignación en mayúsculas', `SMTP_${'PASS'}WORD=${CLAVE}`, 'asignacion-secreta'],
    ['password: de YAML', `    password: ${CLAVE}`, 'asignacion-secreta'],
    ['token de Telegram', `BOT=123456789:AA${TOKEN}${TOKEN}`, 'token-telegram'],
    ['push de Uptime Kuma', `KUMA=https://kuma.local/api/push/${TOKEN}`, 'push-kuma'],
    ['clave sk-', `CLAVE_IA=${'sk-' + TOKEN}`, 'clave-de-proveedor'],
    ['clave ghp_', `GH=${'ghp_' + TOKEN}`, 'clave-de-proveedor'],
    ['clave AIza', `GEMINI=${'AIza' + TOKEN + TOKEN}`, 'clave-de-proveedor'],
    ['clave privada', ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'clave-privada'],
  ])('%s', (_, texto, tipo) => {
    expect(tipos(texto)).toContain(tipo)
  })
})

describe('escanear-secretos: patrones de texto y configuración', () => {
  it.each([
    ['redis://:clave@', `REDIS_URL=redis://:${CLAVE}@redis:6379/0`, 'url-con-credenciales', 'compose.env'],
    ['https://usuario:clave@', `WEBHOOK=https://admin:${CLAVE}@n8n.local/hook`, 'url-con-credenciales', 'notas.md'],
    ['clave en minúscula con =', `secret_key = ${CLAVE}`, 'asignacion-secreta', 'app.conf'],
    ['apiKey con valor literal', `const opciones = { apiKey: '${TOKEN}' }`, 'asignacion-secreta', 'cliente.ts'],
    ['api_key en JSON', `{ "api_key": "${TOKEN}" }`, 'asignacion-secreta', 'config.json'],
    ['Authorization: Bearer <literal>', `curl -H "Authorization: Bearer ${TOKEN}" https://api.local`, 'bearer-literal', 'leeme.md'],
    ['<password> en XML', `<password>${CLAVE}</password>`, 'xml-clave', 'config.xml'],
    ['<key> en XML', `<key>${TOKEN}</key>`, 'xml-clave', 'ossec.conf'],
    ['contraseña con $$ en compose', `      POSTGRES_PASSWORD: Ab9$$cd8Ef`, 'contrasena-con-dolar', 'compose.yaml'],
    ['contraseña con $ en un .env', `DB_PASSWORD=x7$Qp2Lm9`, 'contrasena-con-dolar', '.env.local'],
  ])('%s', (_, texto, tipo, ruta) => {
    expect(tipos(texto, ruta)).toContain(tipo)
  })

  it('url con la contraseña codificada: se decodifica antes de decidir', () => {
    expect(tipos(`postgresql://u:${encodeURIComponent('p@ss&w|rd"$x')}@h:5432/postgres`)).toContain('url-con-credenciales')
    // %63lave decodificada es «clave», un valor de ejemplo
    expect(tipos('postgresql://u:%63lave@h:5432/postgres')).toEqual([])
  })
})

describe('escanear-secretos: sin falsos negativos', () => {
  const j = (...partes) => partes.join('')
  it.each([
    ['$password = "…" en PowerShell', `$password = "${CLAVE}"`, 'rotar.ps1'],
    ['$token = "…" en PowerShell', `$token = "${TOKEN}"`, 'enviar.ps1'],
    ["$apiKey = '…' en PowerShell", `$apiKey = '${TOKEN}'`, 'cliente.ps1'],
    ['*_PASSWORD con puntos (no es un miembro)', `CLAUDE_DEV_PASSWORD=${j('Zorro.', 'Azul2026')}`, '.env.local'],
    ['«test» dentro de una palabra: Latest', `TITAN_PASSWORD=${j('Lat', 'est#2026x')}`, '.env.local'],
    ['«test» dentro de una palabra: Contest', `TITAN_PASSWORD=${j('Con', 'test2024!')}`, '.env.local'],
    ['*_PASSWORD de solo minúsculas', `SMTP_PASSWORD=${j('zorro', 'azulcielo')}`, '.env.local'],
    ['*_TOKEN de solo minúsculas en YAML', `      API_TOKEN: ${j('zorro', 'azulcielo')}`, 'compose.yaml'],
    ['url con una contraseña de 6 caracteres', `DB=postgres://u:${j('abc', '123')}@db:5432/postgres`, 'compose.env'],
  ])('%s', (_, texto, ruta) => {
    expect(escanearTexto(texto, ruta).length).toBeGreaterThan(0)
  })

  it.each([
    ['$password con Read-Host', "$password = Read-Host 'Contraseña' -AsSecureString", 'rotar.ps1'],
    ['$token con $env:', '$token = "$env:API_TOKEN"', 'enviar.ps1'],
    ['$token con otra variable', '$token = $tokenNuevo', 'enviar.ps1'],
    ['"$password": en prosa (no es =)', `"$password": "${CLAVE}"`, 'notas.md'],
    ['«prueba» como palabra entera', `API_TOKEN=${j('clave-de-', 'prueba-1')}`, '.env.local'],
    ['«Test» como palabra en camelCase', `SMTP_PASSWORD=${j('MiTest', 'Pass1')}`, '.env.local'],
    ['*_TOKEN que lee otra variable', 'API_TOKEN=$OTRO_TOKEN', '.env.local'],
    ['MAX_TOKENS no es un secreto', 'MAX_TOKENS=2048', '.env.local'],
  ])('sin hallazgo: %s', (_, texto, ruta) => {
    expect(escanearTexto(texto, ruta)).toEqual([])
  })
})

describe('escanear-secretos: sin falsos positivos', () => {
  it('.env.example del repo', () => {
    const raiz = raizDelRepo()
    expect(escanearTexto(readFileSync(join(raiz, '.env.example'), 'utf8'), '.env.example')).toEqual([])
  })

  it('docs/ y .env.example del repo no tienen hallazgos', () => {
    const raiz = raizDelRepo()
    const { hallazgos, revisados } = escanearArchivos(listarArchivos(raiz, ['docs', '.env.example']), (r) => readFileSync(join(raiz, r)))
    expect(revisados).toBeGreaterThan(0)
    expect(hallazgos).toEqual([])
  })

  it.each([
    ['variable de shell', 'TOKEN=$(cat /run/secrets/token)', 'script.sh'],
    ['expansión con valor por defecto', 'RS=${RECIBIR_SECRETO:-$BASE/secretos/recibir-secreto.sh}', 'script.sh'],
    ['process.env', 'password: process.env.CLAUDE_DEV_PASSWORD', 'config.yml'],
    ['${VAR}', 'PASSWORD="${PG_PASSWORD}"', 'script.sh'],
    ['\\$VAR dentro de comillas', `echo "PGPASSWORD=\\$POSTGRES_PASSWORD psql"`, 'script.sh'],
    ['Bearer con plantilla', 'headers: { Authorization: `Bearer ${sesion.token}` }', 'cliente.mjs'],
    ['Bearer con variable', 'curl -H "Authorization: Bearer $SERVICE_KEY"', 'leeme.md'],
    ['url con variable', 'postgresql://postgres:${PGPASSWORD}@db:5432/postgres', 'compose.yaml'],
    ['url de ejemplo', 'postgres://usuario:clave@host:5432/db y redis://:clave@redis', 'leeme.md'],
    ['clave de ejemplo', 'API_KEY=xxxxxxxxxxxxxxxx', 'archivo.env'],
    ['entre <…>', 'password: <la de tu cuenta>', 'leeme.md'],
    ['prosa con código', '- Token: BotFather `/revoke` y luego', 'leeme.md'],
    ['prosa con :', '- Secretos: `Read-Host -AsSecureString` → pipe a ssh', 'leeme.md'],
    ['código sin comillas', 'const token = tokenDeCabecera(req.headers.get("authorization"))', 'funcion.mts'],
    ['identificador en el código', 'expect(body).toEqual({ email: CORREO, password: CLAVE })', 'prueba.mjs'],
    ['nombre de otra variable', 'export SECRETO_INTERNO=servicio:INDEXER_PASSWORD', 'script.sh'],
    ['lista de nombres', 'SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,VITE_SUPABASE_URL"', 'netlify.toml'],
    ['url sin credenciales', "const TOKEN_URL = 'https://oauth2.googleapis.com/token'", 'gdrive.mts'],
    ['ruta de archivo', '<key>/etc/sslmanager.key</key>', 'ossec.conf'],
    ['miembro de un objeto', 'tokensIn: response.usage.input_tokens', 'notas.md'],
    ['regex de sed', 'sed -E "s#^([[:space:]]*password:[[:space:]]*).*#x#"', 'script.sh'],
    ['valor de ejemplo en SQL', "update public.portal_credentials set password = 'valor-2' where id = v_id;", 'migracion.sql'],
  ])('%s', (_, texto, ruta) => {
    expect(escanearTexto(texto, ruta)).toEqual([])
  })

  it('la clave anónima de Supabase es pública; la service role no', () => {
    expect(tipos(`const SUPABASE_ANON = '${jwt('anon')}'`, 'app.html')).toEqual([])
    expect(tipos(`const CLAVE = '${jwt('service_role')}'`, 'app.html')).toEqual(['jwt'])
  })

  it('una línea con «escanear-secretos: ignorar» se salta', () => {
    expect(escanearTexto(`SMTP_PASSWORD=${CLAVE}  # escanear-secretos: ignorar`, 'archivo.env')).toEqual([])
  })
})

describe('escanear-secretos: ejecución', () => {
  const crear = () => {
    const raiz = mkdtempSync(join(tmpdir(), 'escaner-'))
    mkdirSync(join(raiz, 'docs'))
    mkdirSync(join(raiz, 'tools', '__tests__'), { recursive: true })
    writeFileSync(join(raiz, 'docs', 'limpio.md'), '# Notas\npassword: <la de tu cuenta>\n')
    writeFileSync(join(raiz, 'config.env'), `API_TOKEN=${TOKEN}\n\nSMTP_PASSWORD=${CLAVE}\n`)
    writeFileSync(join(raiz, 'tools', '__tests__', 'algo.test.mjs'), `const k = '${'sb_' + 'secret_' + TOKEN}'\n`)
    writeFileSync(join(raiz, '.env'), `SMTP_PASSWORD=${CLAVE}\n`)
    return raiz
  }

  it('informa archivo:línea y tipo, nunca el valor, y sale con 1', () => {
    const raiz = crear()
    try {
      const salida = []
      expect(main([], { raiz, cwd: raiz, log: (s) => salida.push(s) })).toBe(1)
      const texto = salida.join('\n')
      expect(texto).toContain('config.env:1  asignacion-secreta')
      expect(texto).toContain('config.env:3  asignacion-secreta')
      for (const v of [TOKEN, CLAVE]) expect(texto).not.toContain(v)
      // Sin git: el .env real no se abre y las pruebas quedan fuera salvo con --todo
      expect(texto).not.toMatch(/^\.env:/m)
      expect(texto).not.toContain('algo.test.mjs')
      const todo = []
      expect(main(['--todo'], { raiz, cwd: raiz, log: (s) => todo.push(s) })).toBe(1)
      expect(todo.join('\n')).toContain('tools/__tests__/algo.test.mjs:1  clave-sb-secret')
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('una ruta limpia sale con 0; una fuera del repo, con 2', () => {
    const raiz = crear()
    try {
      const salida = []
      expect(main(['docs'], { raiz, cwd: raiz, log: (s) => salida.push(s) })).toBe(0)
      expect(salida.at(-1)).toBe('Sin hallazgos (1 archivos revisados).')
      expect(main(['..'], { raiz, cwd: raiz, log: () => {} })).toBe(2)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('argumentos', () => {
    expect(leerArgumentos(['--staged'])).toMatchObject({ staged: true, rutas: [] })
    expect(leerArgumentos(['docs', 'tools', '--todo'])).toMatchObject({ staged: false, todo: true, rutas: ['docs', 'tools'] })
    expect(() => leerArgumentos(['--staged', 'docs'])).toThrow(/--staged/)
    expect(() => leerArgumentos(['--rapido'])).toThrow(/desconocida/)
  })
})
