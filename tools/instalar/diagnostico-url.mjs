// Diagnóstico de SUPABASE_DB_URL sin mostrar su valor: solo dice qué forma tiene.
// Uso: node --env-file=.env tools/instalar/diagnostico-url.mjs
const u = process.env.SUPABASE_DB_URL
const si = (b) => (b ? 'SÍ' : 'no')
if (u === undefined) {
  console.log('SUPABASE_DB_URL no está definida en el .env (revisa que la línea empiece exactamente por SUPABASE_DB_URL=)')
  process.exit(2)
}
console.log('Longitud:', u.length)
console.log('Está vacía:', si(u.trim() === ''))
console.log('Empieza por postgresql:// o postgres://:', si(/^postgres(ql)?:\/\//.test(u)))
console.log('Tiene espacios o saltos:', si(/\s/.test(u)))
console.log('Tiene comillas:', si(/["'`]/.test(u)))
console.log('Tiene corchetes [ ]:', si(/[[\]]/.test(u)))
console.log('Tiene el texto YOUR-PASSWORD:', si(/YOUR-PASSWORD/i.test(u)))
console.log('Número de @ (debe ser 1):', (u.match(/@/g) || []).length)
console.log('Número de :// (debe ser 1):', (u.match(/:\/\//g) || []).length)
console.log('Tiene % :', si(u.includes('%')))
console.log('Tiene # o ? antes del @:', si(/[#?]/.test(u.split('@')[0])))
console.log('Termina en /postgres:', si(/\/postgres(\?.*)?$/.test(u.trim())))
const m = /^postgres(?:ql)?:\/\/([^:@/]+):(.*)@([^@/]+)\/(.+)$/.exec(u.trim())
if (!m) {
  console.log('Forma general usuario:contraseña@servidor:puerto/base: NO se reconoce')
} else {
  console.log('Usuario empieza por postgres:', si(m[1].startsWith('postgres')))
  console.log('Contraseña solo con letras y números:', si(/^[A-Za-z0-9]+$/.test(m[2])))
  console.log('Servidor termina en supabase.com o supabase.co:', si(/supabase\.(com|co)(:\d+)?$/.test(m[3])))
  console.log('Lleva puerto:', si(/:\d+$/.test(m[3])))
}
try {
  new URL(u.trim())
  console.log('La cadena es una URL válida: SÍ')
} catch {
  console.log('La cadena es una URL válida: NO')
}

// Segunda parte: forma de la contraseña (sin mostrarla) y si el .env se guardó.
import { statSync } from 'node:fs'
const t = u.trim()
const ini = t.indexOf(':', t.indexOf('://') + 3)
const fin = t.lastIndexOf('@')
if (ini > 0 && fin > ini) {
  const p = t.slice(ini + 1, fin)
  console.log('--- Contraseña ---')
  console.log('Longitud:', p.length)
  console.log('Caracteres que no son letra ni número:', (p.match(/[^A-Za-z0-9]/g) || []).length)
  console.log('Tiene barra /:', si(p.includes('/')))
  console.log('Tiene barra invertida:', si(p.includes(String.fromCharCode(92))))
  console.log('Tiene dos puntos:', si(p.includes(':')))
  console.log('Tiene letras con tilde, ñ u otros no ASCII:', si(/[^\x00-\x7F]/.test(p)))
}
const s = statSync('.env')
console.log('--- Archivo .env ---')
console.log('Guardado por última vez:', s.mtime.toLocaleString('es-CO'))
console.log('Hora actual:', new Date().toLocaleString('es-CO'))
