# portal-producto

Instrucciones para cualquier IA (Claude, Codex, Cursor, Gemini) que trabaje en este proyecto. Claude las carga desde `CLAUDE.md`; las demás leen este archivo directamente.

- Área: personal · Tipo: portal · Creado: 2026-11-07 · Sigla de decisiones: PP
- Qué es: ERP modular para pymes nacido del Team Portal: shell React, Supabase y Netlify Functions, una instalación por cliente con módulos a la carta. Nombre provisional (PP-DEC-12); nombre visible por defecto «Portal del equipo».

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
- Secciones [P: portal] de cada estándar (usa Supabase y Netlify Functions)

## Proyecto

- Stack: React 18 y react-router 7 con Vite 8 y TypeScript `strict` (shell); Supabase (Postgres, Auth, Storage) con supabase-js 2; Netlify Functions con zod 4, web-push, nodemailer y node-ical; Vitest 5 sobre lógica pura, sin jsdom. Node 24 en el PC, 22 en Netlify. Instalador del esquema en Node con `postgres` (devDependency).
- Cómo correrlo en local: `npm install`; `.env` a partir de `.env.example`; servidor de desarrollo `portal-producto` (puerto 5190) y `portal-producto-build` (build más `vite preview`, 4190) en `.claude/launch.json`. A mano: `npm run dev`.
- Verificación mínima antes de commitear: `npm run typecheck`, `npx vitest run --maxWorkers=1`, `npm run build`, `node tools/seguridad/escanear-secretos.mjs` (sale 0), `bash -n` en los scripts bash; recorrido de la pantalla tocada a 1280 y 375 px con el servidor de desarrollo, consola sin errores ni violaciones de CSP (la CSP del shell solo se inyecta en el build: comprobarla con `portal-producto-build`).
- Deploy: ninguno todavía. Cada cliente tendrá su propio Netlify y su propio Supabase (PP-DEC-01). Sin remoto hasta PP-PUSH; cuando exista, un push a `main` se hace solo por pedido explícito del usuario y se confirma aparte. La fase 0.1 se cierra con el tag `v0.1`.
- Commits: `0.1.N — <Área>: <qué cambia>`, un commit por paso, `git add` de rutas explícitas, viñeta en `CHANGELOG.md` (el hash se añade en el commit siguiente).
- Cuenta de GitHub: valdrighilorenzo-star.
- Origen del código: `C:\Users\enzov\IA\luce-design\team-portal`, en solo lectura (nunca se edita ni se lee su `.env`). Lo copiado o adaptado se anota en `docs/origen.md` con el hash de team-portal leído.

## Regla de portes

Todo arreglo de seguridad (autorización, RLS, CSP y cabeceras, secretos, validación de entradas) que se haga en team-portal o en este repo se evalúa en el otro. Este repo guarda en `docs/portes.md` el «último hash de team-portal revisado» y la tabla de portes; la revisión corre `git -C C:\Users\enzov\IA\luce-design\team-portal log <hash>..main -- netlify/lib supabase netlify.toml vite.config.ts tools/seguridad` y anota cada commit como «portado (hash)» o «no aplica (motivo)». Un arreglo de seguridad hecho aquí lo menciona el mensaje de commit para que la sesión de team-portal lo evalúe.

## Documentos del proyecto

| Archivo | Para qué |
|---|---|
| `README.md` | Qué es y cómo se corre |
| `CHANGELOG.md` | Pasos `Mayor.Fase.Paso` con hash |
| `HANDOFF.md` | Estado vigente para la próxima sesión (uno solo; los viejos van a `docs/handoffs/`) |
| `docs/origen.md` | Hash de team-portal por paso, mapa de renombres, portes de módulo, divergencias de esquema |
| `docs/portes.md` | Último hash de team-portal revisado y tabla de portes de seguridad |
| `docs/glosario.md` | Términos canónicos y qué no decir |
| `docs/flujo-ia.md` | Qué hace cada IA en este proyecto y dónde deja sus resultados |

## Decisiones del proyecto

Formato: `PP-DEC-NN — fecha — decisión — qué la reabriría`.

- PP-DEC-01 — 2026-11-07 — Una instalación por cliente: un proyecto Supabase y un sitio Netlify por cliente; sin multiempresa en una misma base — un cliente que pida varias empresas en una sola instalación.
- PP-DEC-02 — 2026-11-07 — Esquema consolidado por dominio (`supabase/esquema/NN-*.sql`) durante las fases 0.x, aplicado por el instalador; migraciones numeradas solo tras la primera venta. Un archivo aplicado no se edita: un cambio va en un archivo nuevo — la primera venta.
- PP-DEC-03 — 2026-11-07 — Gemini como única IA del producto y sin servidores propios (todo en Netlify y Supabase) — cambio de costos o de calidad medido.
- PP-DEC-04 — 2026-11-07 — Módulos a la carta por instalación, sin niveles ni cobro: los activa quien instala con el script service role; el administrador del cliente los ve en solo lectura. `src/lib/modulos.ts` es la fuente única — pedido del usuario.
- PP-DEC-05 — 2026-11-07 — Renombre único de tokens y claves al copiar (PP-TOK): primitivas `--pal-*`, semánticos `--acento`, `--acento-contraste` y `--acento-grafico` (los demás iguales a team-portal), temas `claro`, `calido` y `oscuro`, claves de `localStorage` `pt_*_v1`. El mapa vive en `tools/origen/mapa-renombre.json` — ninguna.
- PP-DEC-06 — 2026-11-07 — Regla de portes de seguridad con `docs/portes.md` en lugar de copias byte a byte o CI cruzada — ninguna.
- PP-DEC-07 — 2026-11-07 — Puertos 5190 (desarrollo) y 4190 (preview) (PP-PORT): 5174 y 4174 los usan los worktrees de team-portal — un choque de puertos.
- PP-DEC-08 — 2026-11-07 — Roboto sola, autoalojada en `public/fuentes` con su licencia en `LICENCIAS.txt` (PP-FONT); Jost no viaja. La licencia registrada es la que acompaña a los archivos copiados de team-portal (@fontsource/roboto 5.2.10: SIL Open Font License 1.1), no la Apache 2.0 que suponía el plan — cambiar de fuente por defecto.
- PP-DEC-09 — 2026-11-07 — Paleta neutra (PP-PAL): grises de base cálida con acento azul petróleo; los valores exactos los fija la prueba de contraste (4,5:1 en texto y 3:1 en bordes, iconos y botón, sin excepciones, en los tres temas) — aprobación del usuario al ver los tres temas.
- PP-DEC-10 — 2026-11-07 — El instalador usa la devDependency `postgres` y conserva `--solo-concatenar` como respaldo para el SQL Editor (PP-PG) — ninguna.
- PP-DEC-11 — 2026-11-07 — El instalador lo corre el usuario con `SUPABASE_DB_URL` en el entorno; nunca la acepta como argumento ni la imprime, y al cliente no se le entrega la cadena de conexión ni la clave de servicio (PP-INST) — ninguna.
- PP-DEC-12 — 2026-11-07 — Nombre provisional `portal-producto`, sigla PP, nombre visible por defecto «Portal del equipo» en `VITE_PORTAL_NOMBRE` (PP-1); se cambia antes del primer push — decisión del usuario sobre el nombre definitivo.
- PP-DEC-13 — 2026-11-07 — El registro de módulos incluye desde el primer día los módulos ERP previstos (inventario, compras, ventas, facturacion, cartera, contabilidad, rrhh) con estado `planeado`; no se pueden activar hasta que lleguen con su fase — ninguna.
- PP-DEC-14 — 2026-11-07 — El tema por instalación se aplica antes de pintar con `public/tema.js` y una caché local de las primitivas; en la primera visita de un navegador se ve un instante la paleta neutra (PP-PARP) — ninguna.
- PP-DEC-15 — 2026-11-07 — Límites por defecto (PP-LIM): sin límite salvo nucleo.miembros = 10 (semilla de 04) e ia.ia_hora_miembro = 20 e ia.ia_dia_equipo = 300 (los pone modulos.mjs al activar ia sin --limites) — pedido de un cliente o medición de uso.
- PP-DEC-17 — 2026-11-09 — Nombre definitivo del producto: **TailorSuite** (cierra PP-1 y reemplaza a PP-DEC-12). Repo privado `github.com/valdrighilorenzo-star/TailorSuite`. La carpeta local sigue en `personal\portal-producto` y la sigla PP se mantiene; el nombre visible dentro de la app se cambia en un paso propio — decisión del usuario.
- PP-DEC-16 — 2026-11-07 — Las comprobaciones de `--verificar` que leen las filas de modulos_instalacion (slugs, límites, dependencias) las hace aplicar.mjs contra el registro y no verificar.sql: una consulta suelta no puede nombrar una tabla que quizá no existe y así no se inyecta texto en el SQL — que verificar.sql deba correr también desde el SQL Editor.
