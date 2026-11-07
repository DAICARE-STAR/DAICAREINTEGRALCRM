// Común del instalador: lectura del entorno, archivos del esquema, sha256
// sobre el contenido normalizado a LF y cliente postgres. Sin dependencias
// fuera de node: `postgres` se importa solo al conectar, para que las pruebas
// con cliente falso no lo necesiten.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const CARPETA_ESQUEMA = join(RAIZ, 'supabase', 'esquema')
export const ESQUEMA_INSTALADOR = 'instalador'
export const VARIABLE_URL = 'SUPABASE_DB_URL'
// Archivos del esquema: NN-nombre.sql, con una letra opcional tras el número
// (01b-seguridad-resumen.sql) para añadir sin renumerar
export const PATRON_ARCHIVO = /^(\d{2})([a-z]?)-[a-z0-9-]+\.sql$/

// La cadena de conexión viene SOLO del entorno (PP-DEC-11). null si falta.
export function leerUrlBase(env = process.env) {
  const v = env[VARIABLE_URL]
  return v && v.trim() ? v.trim() : null
}

export const normalizar = (texto) => texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')

export function sha256(texto) {
  return createHash('sha256').update(normalizar(texto)).digest('hex')
}

export function numeroDe(nombre) {
  const m = PATRON_ARCHIVO.exec(basename(nombre))
  return m ? Number(m[1]) : null
}

// Nombres de los archivos del esquema en orden de aplicación
export function listarArchivosEsquema(carpeta = CARPETA_ESQUEMA) {
  return readdirSync(carpeta)
    .filter((n) => PATRON_ARCHIVO.test(n))
    .sort((a, b) => a.localeCompare(b, 'en'))
}

export function leerArchivo(ruta) {
  const texto = normalizar(readFileSync(ruta, 'utf8'))
  return { nombre: basename(ruta), ruta, texto, sha256: sha256(texto) }
}

export function versionProducto(raiz = RAIZ) {
  return JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version
}

// Quita la cadena de conexión y su contraseña de cualquier texto que vaya a
// imprimirse (mensajes de error del driver incluidos).
export function ocultarUrl(texto, url) {
  let salida = String(texto)
  if (!url) return salida
  salida = salida.split(url).join(`[${VARIABLE_URL}]`)
  try {
    const u = new URL(url)
    if (u.password) salida = salida.split(u.password).join('[contraseña]').split(decodeURIComponent(u.password)).join('[contraseña]')
  } catch {
    // no es una URL: ya se reemplazó entera
  }
  return salida
}

// Interfaz mínima que usa aplicar.mjs: consultar(texto, params) → filas,
// transaccion(fn) con el mismo consultar dentro, cerrar(). Las pruebas
// inyectan un objeto así; en producción lo da adaptarPostgres.
export function adaptarPostgres(sql) {
  const envolver = (s) => ({
    consultar: async (texto, params) => (params ? s.unsafe(texto, params) : s.unsafe(texto)),
    transaccion: (fn) => s.begin((tx) => fn(envolver(tx))),
    cerrar: () => s.end({ timeout: 5 }),
  })
  return envolver(sql)
}

export async function crearCliente(url) {
  const { default: postgres } = await import('postgres')
  // Una conexión basta: los archivos se aplican en serie. Sin preparar
  // sentencias, para que la transacción del pooler no las pierda.
  return adaptarPostgres(postgres(url, { max: 1, prepare: false, onnotice: () => {} }))
}
