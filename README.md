# portal-producto

ERP modular para pymes nacido del Team Portal: shell React, Supabase y Netlify Functions, una instalación por cliente con módulos a la carta. Nombre provisional; el nombre visible por defecto es «Portal del equipo».

## Cómo correrlo

1. `npm install` (Node 22.12 o superior; en el PC, Node 24).
2. Copiar `.env.example` a `.env` y llenar las variables de la instalación. Los valores secretos solo viven en `.env` y en el gestor de contraseñas.
3. Desarrollo: `npm run dev` (puerto 5190). Build y vista previa del build con la CSP del shell: `npm run preview:build` (puerto 4190). Desde Claude Code se usan las entradas `portal-producto` y `portal-producto-build` de `.claude/launch.json`.

Verificación: `npm run typecheck`, `npm test`, `npm run build`, `npm run secretos` (escáner de secretos; sale 0 sin hallazgos).

## Estructura

| Ruta | Qué contiene |
|---|---|
| `src/` | Shell React: `lib/` lógica pura con pruebas en `__tests__/`, `estilos/` tokens y temas |
| `netlify/` | Funciones de servidor y su código común; pruebas de contrato en `__tests__/` |
| `supabase/esquema/` | Esquema consolidado por dominio que aplica el instalador |
| `tools/seguridad/` | Escáner de secretos |
| `tools/instalar/` | Instalador del esquema (`aplicar.mjs`) y de los módulos de la instalación (`modulos.mjs`) |
| `docs/` | Origen del código, portes, glosario, flujo entre IA |

## Estado

Creado el 2026-11-07 en el área personal. El estado vigente está en `HANDOFF.md` y la historia en `CHANGELOG.md`. Las decisiones del proyecto (PP-DEC) están en `AGENTS.md`.
