import { defineConfig } from 'vitest/config'

// Pruebas de lógica pura (src/lib, netlify/lib, tools). Sin jsdom, sin red:
// las funciones que se prueban reciben datos y devuelven datos. Las pruebas de
// render estático (.test.tsx) usan react-dom/server en este mismo entorno node.
export default defineConfig({
  // Las pruebas no leen el .env de quien instala: con él, el resultado
  // dependía de las credenciales de cada PC
  envDir: false,
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.ts', 'tools/**/*.test.{ts,mjs}'],
  },
})
