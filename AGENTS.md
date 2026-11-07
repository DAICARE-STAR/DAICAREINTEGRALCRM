# portal-producto

Instrucciones para cualquier IA (Claude, Codex, Cursor, Gemini) que trabaje en este proyecto. Claude las carga desde `CLAUDE.md`; las demás leen este archivo directamente.

- Área: personal · Tipo: portal · Creado: 2026-11-07
- Qué es: ERP modular para pymes nacido del Team Portal: shell React, Supabase y Netlify Functions, una instalacion por cliente con modulos a la carta

## Reglas generales

Rigen las reglas personales de `C:\Users\enzov\IA\AGENTS.md` (idioma, tono, secretos, Windows) y las decisiones de `C:\Users\enzov\IA\estandares\decisiones-cerradas.md`. Si una regla de este archivo contradice un estándar, manda este archivo dentro del proyecto y se anota por qué en «Decisiones del proyecto».

## Estándares que aplican

Leer antes de programar el archivo que corresponda a la tarea (`C:\Users\enzov\IA\estandares\INDICE.md` dice cuál):

- `C:\Users\enzov\IA\estandares\00-principios.md` — siempre
- `C:\Users\enzov\IA\estandares\decisiones-cerradas.md` — siempre
- `C:\Users\enzov\IA\estandares\flujo-trabajo.md` — commits, versionado, deploy, handoffs
- `C:\Users\enzov\IA\estandares\verificacion.md` — qué comprobar antes y después de cada cambio
- `C:\Users\enzov\IA\estandares\codificacion.md` — código, base de datos, pruebas
- `C:\Users\enzov\IA\estandares\seguridad.md` — secretos, autorización, entradas, CSP
- `C:\Users\enzov\IA\estandares\ui.md` — interfaz, accesibilidad, SEO
- Secciones [P: portal] de cada estándar si usa Supabase y Netlify Functions

## Proyecto

- Stack: (completar)
- Cómo correrlo en local: (completar; si hay servidor de desarrollo, va en `.claude/launch.json`)
- Verificación mínima antes de commitear: (completar con los comandos reales: typecheck, test, build, recorrido)
- Deploy: (completar: dónde publica y qué lo dispara; un push que publica se confirma aparte)
- Cuenta de GitHub: valdrighilorenzo-star

## Documentos del proyecto

| Archivo | Para qué |
|---|---|
| `README.md` | Qué es y cómo se corre |
| `CHANGELOG.md` | Pasos `Mayor.Fase.Paso` con hash |
| `HANDOFF.md` | Estado vigente para la próxima sesión (uno solo; los viejos van a `docs/handoffs/`) |
| `docs/glosario.md` | Términos canónicos y qué no decir |
| `docs/flujo-ia.md` | Qué hace cada IA en este proyecto y dónde deja sus resultados |

## Decisiones del proyecto

Formato: `PP-DEC-NN — fecha — decisión — qué la reabriría`.

- (ninguna todavía)
