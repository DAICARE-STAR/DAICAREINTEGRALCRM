# portal-producto

Instrucciones para cualquier IA (Claude, Codex, Cursor, Gemini) que trabaje en este proyecto. Claude las carga desde `CLAUDE.md`; las demás leen este archivo directamente.

- Área: personal · Tipo: portal · Creado: 2026-11-07 · Sigla de decisiones: PP
- Qué es: ERP modular para pymes nacido del Team Portal: shell React, Supabase y Netlify Functions, una instalación por cliente con módulos a la carta. Nombre: Bash Logistics (PP-DEC-27); es también el nombre visible por defecto si la instalación no define `VITE_PORTAL_NOMBRE`.

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
- Campos de texto: todo `<input>` y `<textarea>` declara `autoComplete="off"` (salvo login y contraseñas, que llevan su valor propio); los de datos de personas y de salud toman sus atributos de `campoPersona` (`src/lib/campos.ts`: `name` opaco con prefijo `bl-` y avisos para los gestores de contraseñas), porque Chrome y Edge ignoran `off` en su autorrelleno y adivinan el tipo por el `name`; Editar perfil no lleva ejemplos en gris. Los `placeholder` son ejemplos inventados y neutros: nunca un dato real, el correo de la sesión, un cargo, un teléfono, una dirección ni una marca de tercero. Lo vigilan `src/lib/__tests__/formularios-neutros.test.ts` y `neutralidad.test.ts`.
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
| `docs/esquema.md` | Convenciones de esquema: contrato base de tabla, moneda como par, numeración de documentos y máquina de estados |
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
- PP-DEC-12 — 2026-11-07 — (Reemplazada por PP-DEC-17 y luego por PP-DEC-27.) Nombre provisional `portal-producto`, sigla PP, nombre visible por defecto «Portal del equipo» en `VITE_PORTAL_NOMBRE` (PP-1); se cambia antes del primer push — decisión del usuario sobre el nombre definitivo.
- PP-DEC-13 — 2026-11-07 — El registro de módulos incluye desde el primer día los módulos ERP previstos (inventario, compras, ventas, facturacion, cartera, contabilidad, rrhh) con estado `planeado`; no se pueden activar hasta que lleguen con su fase — ninguna.
- PP-DEC-14 — 2026-11-07 — El tema por instalación se aplica antes de pintar con `public/tema.js` y una caché local de las primitivas; en la primera visita de un navegador se ve un instante la paleta neutra (PP-PARP) — ninguna.
- PP-DEC-15 — 2026-11-07 — Límites por defecto (PP-LIM): sin límite salvo nucleo.miembros = 10 (semilla de 04) e ia.ia_hora_miembro = 20 e ia.ia_dia_equipo = 300 (los pone modulos.mjs al activar ia sin --limites) — pedido de un cliente o medición de uso.
- PP-DEC-17 — 2026-11-09 — (Reemplazada por PP-DEC-27.) Nombre definitivo del producto: el nombre anterior del producto (cierra PP-1 y reemplaza a PP-DEC-12). Repo privado en GitHub con ese nombre, hoy `github.com/valdrighilorenzo-star/Bash_Logistics`. La carpeta local sigue en `personal\portal-producto` y la sigla PP se mantiene; el nombre visible dentro de la app se cambia en un paso propio — decisión del usuario.
- PP-DEC-18 — 2026-11-09 — El CRM nativo se adelanta como fase 0.2 por el primer cliente: slug `crm` (reemplaza a `directorio`, que era un adaptador de HubSpot sin tablas), tablas propias `crm_*` en `supabase/esquema/21-crm.sql`, catálogos (etapas, orígenes, tipos) en `instalacion.ajustes.crm`, borrado físico solo administrador. El conector `crm` queda como hueco para un CRM externo (`crm_vinculos_externos`) — un cliente que exija sincronizar con un CRM externo.
- PP-DEC-19 — 2026-11-09 — Datos de salud de las personas atendidas desde la 0.2, por requisito del cliente: tabla aparte cifrada con pgcrypto y clave fuera de la base de datos de la API, permisos `ver_salud` y `edit_salud` solo-admin (un administrador no los tiene por serlo), segundo factor obligatorio para leer y escribir (excepción a «MFA opcional» solo en este módulo), registro de cada acceso y consentimiento informado previo (Ley 1581 de 2012 y Decreto 1377 de 2013). Nada de salud en historial, auditoría, logs, búsqueda ni exportación — cambio normativo o decisión del cliente.
- PP-DEC-16 — 2026-11-07 — Las comprobaciones de `--verificar` que leen las filas de modulos_instalacion (slugs, límites, dependencias) las hace aplicar.mjs contra el registro y no verificar.sql: una consulta suelta no puede nombrar una tabla que quizá no existe y así no se inyecta texto en el SQL — que verificar.sql deba correr también desde el SQL Editor.
- PP-DEC-20 — 2026-11-17 — Los campos de datos de personas y de salud, incluido Editar perfil, cierran el autorrelleno del navegador con campoPersona aunque eso incumpla WCAG 2.2 SC 1.3.5 en los datos del propio usuario: pesa más que no se crucen datos entre productos y clientes en un mismo navegador — una auditoría de accesibilidad que lo exija o un cliente que lo pida.
- PP-DEC-21 — 2026-11-17 — Los módulos traídos de team-portal cuyo archivo de esquema todavía no existe (calendario, chat, proyectos, manuales, productos, cotizador, gerencia, licitaciones, sitio-web, y disenos porque depende de proyectos) quedan con estado `planeado` hasta portarse, con su declaración completa y su archivo previsto en `sql`. Un planeado no se activa, no se ve ni cuenta como activo aunque su fila lo esté (`estaActivo`); `modulos.test.ts` falla si un módulo `disponible` declara un `sql` que no existe en `supabase/esquema` o depende de uno que no es activable (D-1 del análisis de ERP) — que haga falta distinguirlos de los ERP en Administración con un estado propio «por portar».
- PP-DEC-22 — 2026-11-17 — Dependencias blandas (BL-01, D-2): `depende` solo nombra el módulo cuyo modelo se lee (catálogo `productos`, terceros `crm`, facturas para cartera); lo demás va en `integra`, que no bloquea la activación y declara el puente que se aplicará cuando ambos estén activos. Los puentes no existen todavía: llegan con la fase de cada módulo. Facturación se activa sin inventario ni compras; `modulos.mjs --activar` informa el orden de activación de lo que falta, marcando los planeados — que D-3 lleve los terceros al núcleo (cambia `crm` por el núcleo en `depende`) o un módulo que no funcione sin el modelo de otro.
- PP-DEC-23 — 2026-11-17 — Contrato base de tabla (BL-02): toda tabla de negocio de un módulo lleva `created_by`, `updated_by`, `created_at`, `updated_at`, `creado_via` (manual, importacion, api, regla, sistema) y `archivado_en`, con el trigger `zz_contrato_sellar` (el último de los BEFORE, que se ordenan por nombre) que sella autoría y fechas sin excepción (lo que mande el cliente se ignora) y deja `creado_via` fijo tras el alta. Se aplica con `contrato_aplicar` de `00b-contrato-tabla.sql`; el CRM lo recibe en `21d-crm-contrato.sql`. Exentas y omisiones, con motivo, en `contrato-tabla.test.ts`; convención en `docs/esquema.md` — una tabla de negocio que no pueda llevarlo o un canal de alta que haya que garantizar (entonces `creado_via` se sella por rol).
- PP-DEC-24 — 2026-11-17 — Moneda como par (BL-08, D-15 opción a): un importe son dos columnas, `<col> public.importe` (numeric(18,4) sin NaN) y `<col>_moneda public.codigo_moneda` (ISO 4217), con un check de pareja; no un tipo compuesto, porque la API y supabase-js filtran, ordenan y suman columnas simples. La moneda por defecto es `instalacion.moneda_base` y la pone el cliente; utilidades en `src/lib/moneda.ts`. Ninguna tabla guarda importes todavía; el tipo de campo personalizado «moneda» del CRM queda para BL-42 — un cliente que facture en varias monedas (tasa por documento) o un importe que no quepa en numeric(18,4).
- PP-DEC-25 — 2026-11-17 — Numeración de documentos en la base (BL-05a, D-10): tabla `series` y `series_siguiente` de `09b-numeracion.sql`, con dos modos. `con_huecos` (cotizaciones, pedidos) usa una secuencia propia por serie y periodo y no bloquea; `sin_huecos` (lo fiscal) bloquea la fila de la serie dentro de la transacción del documento, espera hasta 2 s (`lock_timeout`) y falla cerrado fuera de vigencia, con el tope agotado o con una fecha de un periodo ya pasado. El número fiscal se asigna al publicar, no al crear el borrador. Solo la service role y las funciones security definer avanzan una serie; quien tiene `gestionar_series` ve y edita prefijo, relleno, tope y vigencia, nunca el contador, tampoco un administrador (D-9). Convención en `docs/esquema.md` — la numeración fiscal con resolución DIAN (BL-05b, D-7) o una serie que necesite más de 2 s de espera.
- PP-DEC-26 — 2026-11-17 — Máquina de estados por entidad (BL-06): catálogo de estados con categoría fija (borrador, en_curso, aprobado, hecho, anulado) y un inicial, transiciones con el permiso que exigen y `aplicar_transicion` (security invoker) con `update … where id = … and estado = esperado`, una fila exacta o error de conflicto `40001`, y fila `estados.transicion` en la auditoría; `09c-estados.sql`. El trigger `zy_estados_guardia` obliga al estado inicial, rechaza el cambio de estado por fuera de la función y el borrado fuera de borrador. El administrador no tiene excepción: pasa los permisos como en todo `has_perm`, pero no una transición que no está en el catálogo ni un update directo (D-9, opción b). Sin sesión no hay permiso. Ninguna tabla la usa todavía; la primera llega con la 0.7 — un proceso del servidor que deba cambiar estados sin sesión o una transición que dependa de datos del documento.
- PP-DEC-27 — 2026-11-17 — Nombre definitivo del producto: Bash Logistics; reemplaza a PP-DEC-17. Repo privado github.com/valdrighilorenzo-star/Bash_Logistics; la carpeta local sigue en personal\portal-producto y la sigla PP se mantiene — decisión del usuario.
