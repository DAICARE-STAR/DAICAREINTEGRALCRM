# Origen del código

El producto nace de `C:\Users\enzov\IA\luce-design\team-portal` (solo lectura). No hay sincronía byte a byte ni archivos idénticos entre los dos repos: cada paso copia o adapta lo que necesita y anota aquí el hash de team-portal que leyó (`git -C <team-portal> rev-parse --short HEAD`). La regla de portes de arreglos de seguridad vive en `portes.md`.

## Hashes de origen por paso

| Paso | Fecha | Hash de team-portal | Qué se copió o adaptó |
|---|---|---|---|
| 0.1.2 (PR-0) | 2026-11-07 | f3262bc | `tools/seguridad/escanear-secretos.mjs` y `__tests__/escanear-secretos.test.mjs` (adaptados: sin los valores de fábrica de Wazuh ni las rutas permitidas del arnés de servidores). Modelos, no copias: `vite.config.ts` (CSP del shell, origen de Supabase), `netlify.toml` (cabeceras base y 404 forzados de la línea de hardening), `tsconfig.json`, `tsconfig.netlify.json`, `vitest.config.ts`, `.env.example`. |
| 0.1.4 (PR-2) | 2026-11-07 | f3262bc | Copiados: `public/fuentes/roboto-latin-{400,500,700}-normal.woff2` y la sección Roboto de `LICENCIAS.txt` (de `public/apps/shared/fuentes/`; Jost no viaja). Modelos renombrados con el mapa: `src/estilos/paleta.css` (de `marca.css`, con la paleta neutra PP-DEC-09), `src/estilos/temas.css` (de `temas.css`), `public/tema.js` (de `temas.js`, más la caché de primitivas), `src/lib/theme.ts` (de `theme.ts`), `src/lib/contraste.ts` y su prueba (fórmula y pares de `contraste.test.ts`). |
| 0.1.5 (PR-3) | 2026-11-07 | f3262bc | Código nuevo, sin copia: el instalador y verificar.sql siguen los criterios de verificacion.md y de las comprobaciones de rls-simulacion.sql y seguridad_resumen() de team-portal, sin tomar su texto. |
| 0.1.15 (PR-5) | 2026-11-07 | 12b1b72 | Modelos, no copias: `supabase/pruebas/rls-simulacion.sql` sigue la estructura de la de team-portal (BEGIN … ROLLBACK, rls.txid por sección, resultado como error) con casos nuevos sobre instalador.cuentas_prueba; `tools/instalar/cuentas-prueba.mjs` toma de `tools/seguridad/sesion.mjs` la pregunta sin eco. |
| 0.1.13 (PR-5) | 2026-11-07 | 12b1b72 | Código nuevo: `supabase/esquema/04-instalacion-modulos.sql`. Patrones leídos sin copiar texto: fila única de security_settings (64), política restrictiva de exigir_mfa (43) y puede_ver_app de la 63 (la v2 no lee portal_apps). |
| 0.1.12 (PR-4) | 2026-11-07 | 12b1b72 | Adaptados al esquema consolidado `supabase/esquema/00-03`: versión final de schema.sql y de las migraciones 2, 3, 9, 13, 18, 19, 27, 31, 35, 43, 63, 64, 71, 84, 87 y 88 para los objetos del núcleo, sin semillas con emoji, sin app demo y sin nombres ni correos de team-portal. Lo de módulos de esas migraciones (radar, bitácora, bóveda, leads del sitio, buckets) queda para el archivo de cada módulo. |
| 0.1.19 (N-1) | 2026-11-07 | 9d1524b (11 archivos en 5710280) | Commit de origen: copia única del núcleo, neutralizada y renombrada con `tools/origen/renombrar.mjs`. Detalle en § Commit de origen. |
| 0.1.20 (N-2) | 2026-11-07 | 9d1524b | Adaptados a `supabase/esquema/05-09`: migraciones 12, 19, 20, 24, 27, 28, 30, 36, 47, 63 §4, 73, 83, 84, 89 y 90 para los objetos del núcleo. Sin la 95 (no existe en team-portal: perfil_privado llega en un 05b), sin inicio_checklist, project_reports ni los claim_* (son de módulo). `rls-simulacion.sql` 8 a 11 siguen las secciones 13 y 14 de la de team-portal sin copiar texto. |
| 0.2.11-0.2.12 | 2026-11-15 | a453b63 y siguiente | Adaptados a mano, sin copia de archivos salvo `src/components/CabeceraMarco.tsx` (idéntico): barra fija, alto real de la cabecera, ancho y margen compartidos con `.page`, tokens de pestañas y barras. La barra plegable de `BarraFiltros` es código propio (las apps de team-portal la hacen en `public/apps/shared/filterbar.js`). |

## Commit de origen (0.1.19, N-1)

- **H = 9d1524b** (team-portal `main`, paso 1.12.22, 2026-11-07). Leído con `git show H:<ruta>`, sin tocar el árbol de trabajo ni el `.env` de team-portal.
- **Condición pendiente de verificar.** El plan (linea-producto-v2.md § N-1, integracion-r2.md § V3) pedía copiar en el hash con B1 y B3 mergeados y las migraciones 87 a 90 **aplicadas**. Al copiar, las 87 a 90 están escritas en team-portal (b545dfa, 241e030, 64e951d, bdf5a66) pero no consta que estén aplicadas en ninguna base. La copia no depende de eso (no se copió SQL), pero el usuario confirma que están aplicadas en team-portal antes de N-2, que porta la 89 y la 90.
- **Perfiles ampliados fuera.** Los 11 archivos que cambiaron entre 5710280 y H (1.12.21 y 1.12.22: datos laborales en Equipo, tarjeta, Editar perfil y Miembros) se tomaron en **5710280**, el estado anterior: `src/types.ts`, `src/styles.css`, `src/context/AuthContext.tsx`, `src/components/EditProfileModal.tsx`, `src/components/ProfileCard.tsx`, `src/components/RightRail.tsx`, `src/lib/calendar.ts`, `src/lib/data.ts`, `src/pages/Team.tsx`, `src/pages/admin/MembersTab.tsx` y `src/lib/__tests__/calendar.test.ts`. Los perfiles ampliados y los productos llegan después como portes (V5, V8).
- **Archivos copiados (116).** La lista exacta es `ARCHIVOS` de `tools/origen/renombrar.mjs`. En resumen:
  - Shell: `src/main.tsx`, `App.tsx`, `types.ts`, `styles.css`; `src/context/` (Auth, Cabecera, Notifications, Presence); `src/components/` del núcleo (AppIcon, Avatar, BackToTop, CabeceraMarco, CabeceraPagina, CommandPalette, Dialogo, EditProfileModal, IconosNav, InfoI, Layout, LogoLoader, MfaGate, MfaModal, NotifBell, NotifSections, PasswordModal, Pestanas, ProfileCard, ProtectedRoute, RightRail, Skeleton, UsoLatido, WidgetBoundary, WidgetCard, WorldClockWidget).
  - `src/lib/`: audit, cabeceraMarco, calendar, data, enlaces, fechas, funciones, iconos-apps, moneda, scrollfx, search, supabase, team, teclado, useArrastreWidgets, useDialogo, useEsMovil, usePush, useTitulo, useWidgetData, uso, widgets, widgetsPrefs.
  - Páginas: Dashboard, Team, Login, Tools, Admin y `admin/` AuditTab, CabeceraAdmin, ConnectorsTab, MembersTab, NovedadesTab, RolesField, RolesTab, UsoTab, WidgetsTab.
  - `netlify/lib/`: autorizacion, email, errores, estados, gemini, ia, ia-modelos, ia-prompts, ics, push. `netlify/functions/`: check-event-reminders, notify-event, push-notify, revision-seguridad, uso-purga.
  - `tools/seguridad/`: sesion.mjs, pruebas-autorizacion.mjs, generar-contrasena.ps1 (el escáner de secretos ya estaba desde 0.1.2).
  - `public/push-sw.js`; la hoja `public/apps/shared/base.css` pasa a `src/estilos/base-shell.css` (la importa `base.css`).
  - Pruebas de lo copiado: `src/lib/__tests__/` cabeceraMarco, cabeceras, calendar, enlaces, fechas, funciones, iconos-apps, moneda, search, teclado, useArrastreWidgets, useWidgetData, uso, widgetsPrefs; `netlify/lib/__tests__/` autorizacion, email, errores, estados, ia, ia-modelos, ia-prompts, push; `netlify/functions/__tests__/` correos y vigia; `tools/seguridad/__tests__/pruebas-autorizacion.test.mjs`.
- **No viajan:** `public/apps`, `supabase/*`, tools del servidor propio, docs y manuales de team-portal, `connector-proxy.ts` (se reescribe en N-6), las páginas y la lógica de Calendario, Chat, Correo, Sitio web y el visor de apps (llegan en su fase). Tampoco, por servir solo a módulos: los widgets de módulo (TRM, radar, pipeline, reuniones, pendientes, seguimiento, checklist, fechas, diseños, ofertas, facturación, leads, analítica), ChatDock, las pestañas Aplicaciones, Marcas, Correo e IA de Administración, y `src/lib/` api, chat, mail, inicio (importa seguimiento), ia-precios, ia-trabajo, seguimiento, sitioWeb y cabecerasNetlify. `src/lib/theme.ts` no se copió: queda el del producto (0.1.4).
- **Logos neutros (PP-PWA).** Los 8 PNG de `public/brand` (mismos nombres que team-portal) los genera `renombrar.mjs`: un cuadrado redondeado en acento con un cuadro claro, sin texto. `logo-banner-transp.png` va a 880×440 en lugar del original de 3780×1890. El manifest del build los declara (`vite.config.ts`) e `index.html` enlaza el favicon.
- **Qué hizo renombrar.mjs:** el mapa (primitivas, semánticos, temas, claves de `localStorage` y globales), los colores de la paleta de origen escritos a mano (correos, colores de evento) a su primitiva neutra, y la lista de textos `TEXTOS` (nombre, dominio, sitio, proyecto de Supabase, cuentas de servicio y firmas). Falla cerrado si queda un token sin destino o un texto de la marca.
- **Adaptaciones a mano en el mismo commit:**
  - `App.tsx` solo con las rutas del núcleo (Inicio, Herramientas, Equipo, Administración, Login y 404), sin filtrar por módulos (N-3). `Layout.tsx` sin ChatDock ni los enlaces a Chat, Correo y Calendario; Equipo sigue en «Comunicación».
  - `Dashboard.tsx` y `src/lib/widgets.ts` con un solo widget de núcleo (`clock`). `Admin.tsx` sin Aplicaciones, Marcas, Correo ni IA.
  - `main.tsx` importa `estilos/base.css` antes de `styles.css` y usa `iniciarTema`; `EditProfileModal` usa la API de tema del producto (`leerTema`, `aplicarTema`) con una muestra de fondo y acento por primitivas. `base.css` pierde `.card`, `.muted` y `.acento` de la página mínima (los define `styles.css`) e importa `base-shell.css`.
  - Nombre de la instalación: `NOMBRE_PORTAL` (VITE_PORTAL_NOMBRE) en el título, la campana, Login, MfaGate y el logo del menú; `nombrePortal()` de `netlify/lib/email.mts` en remitentes y cabeceras de los correos. `LogoLoader` pasa a un anillo neutro.
  - `usePush.ts` lee la clave pública VAPID de `VITE_VAPID_PUBLIC_KEY` (el origen la tenía escrita en el código); sin ella el push queda no disponible. `email.mts` ya no supone un servidor SMTP: exige `SMTP_HOST`.
  - Prompts de IA (`ia-prompts.mts`) sin el rubro ni el blog de la empresa de origen; los hashes fijados de su prueba se actualizaron.
  - `WorldClockWidget` toma por defecto la zona del navegador y Londres. Las funciones programadas declaran `config` sin el tipo de `@netlify/functions` (no es dependencia del producto).
  - `.env.example` suma las variables que leen las funciones copiadas (SMTP, VAPID, Gemini, URL, PORTAL_URL, cuenta de los scripts); `entorno.test.ts` admite `VAPID_PUBLIC_KEY` como pública por diseño.
  - Pruebas recortadas a lo copiado: de `correos.test.ts` salen calendar-ics, mail-inbox, mail-ai, scan-alertas-correo, calendar-import y los dos casos que leen el sembrador de mantenimiento; de `vigia.test.ts`, check-tender-alerts, sync-connectors y las secciones de netlify.toml, CSP de las apps y proceso (el producto tiene `netlify/__tests__/cabeceras.test.ts`); de `autorizacion.test.ts`, mail-auth; de `estados.test.ts` y `moneda.test.ts`, la paridad con las copias de las apps estáticas; de `cabeceras.test.ts`, el visor de apps y la hoja de las apps.
- **Pendiente para fases siguientes:** `email.mts` conserva la lista `CUENTAS_SERVICIO` por correo (con direcciones neutras); el producto marca las cuentas de servicio con `profiles.es_servicio` y el cambio va en N-6. Los avisos y husos horarios siguen en `America/Bogota` hasta que lleguen `instalacion.zona_horaria` al código (N-2 y N-3). `revision-seguridad.mts` lee `leads_24h` de `seguridad_resumen()`, que la v2 del producto no trae: sin efecto hasta que se ajuste en N-6. `Layout.tsx` y `CommandPalette.tsx` siguen leyendo `portal_apps` y nombrando rutas de módulo: los rehace N-3.
- **Ajustes de la revisión (producto-fix, 0.1.23 en adelante):**
  - `member_status` (migración 15) no está en el núcleo 00-09: es del módulo chat (`11-chat.sql`, plan C-2) y figura en sus tablas del registro. El latido de `PresenceContext`, la última conexión de Equipo y la de `ProfileCard` solo la consultan con chat activo; los proyectos de `ProfileCard`, solo con proyectos activo. `tender_notifications` (radar) solo se consulta y se suscribe con licitaciones activo, y la sección Radar no se pinta sin él. Los enlaces `/apps/<slug>` pasan a `/<ruta>` (y el respaldo de un enlace externo, al Inicio). Lo vigila `tablas-modulo.test.ts`.
  - `uploadSiteImage` ya no sube a `blog` por defecto: cada función nombra su bucket, y `blog` es del módulo sitio-web (`28-sitio-web.sql`), no del núcleo. La lista permitida está en `storage-usos.test.ts` (N-2).
  - Widgets del núcleo: el registro y la semilla de `07-widgets-uso.sql` quedan en `clock`, lo único que pinta el shell; `pendientes` y `cumpleanos` vuelven a ambos cuando se porten sus widgets (07 no está aplicado en ninguna base). Lo vigila `inicio-widgets.test.ts`.

## Mapa de renombres

Se escribe una sola vez al copiar (PR-2) y vive en `tools/origen/mapa-renombre.json`: primitivas `--ld-*` a `--pal-*`, semánticos `--gold*` a `--acento*`, temas `marfil`, `hueso` y `enfasis` a `claro`, `calido` y `oscuro`, claves de `localStorage` `ld_*` a `pt_*_v1`. En 0.1.19 se sumó el grupo `claves`: las demás claves de `localStorage` del shell pasan a `pt_` con el mismo nombre y versión (`ld_widgets_v3` a `pt_widgets_v3`, `ld_nav_open_v1` a `pt_nav_open_v1`…).

## Portes de módulo

Cada módulo se reescribe en su fase leyendo team-portal en el hash de ese momento. Lo que el commit de origen dejó fuera por ser de módulo está en § Commit de origen, «No viajan».

| Módulo | Fase | Hash de team-portal | Fecha | Notas |
|---|---|---|---|---|
| (ninguno todavía) | | | | |

## Divergencias de esquema

Nombres de tabla y columna que el producto cambia respecto de team-portal (por defecto se conservan).

| Objeto | team-portal | Producto | Motivo |
|---|---|---|---|
| portal_apps | tabla de apps con «Visible para» | no viaja | Sin iframe no hay URL que registrar; nombre, icono y orden salen de src/lib/modulos.ts (puede_ver_app v2 llega en 04) |
| roles.funcion | no existe (team-portal busca roles por nombre: leads, perdidas, bot, claude-dev) | text null con check aviso_leads, aviso_perdidas o qa y un rol por función | TP-6 de serie; bot no viaja. El freno de escalada protege is_system o funcion not null |
| profiles.es_servicio | no existe (cuentas de servicio por lista de correos) | boolean not null default false; solo lo cambia la service role o el SQL Editor (un administrador no, para no saltar nucleo.miembros) | TP-6 de serie; cuentas_servicio_ids() la lee |
| connectors.url | text sin check | check http(s) sin espacios, comillas ni < > | Es el href de «Abrir»: nunca javascript: ni data: |
| instalacion | no existe (los datos de la empresa viven en el código) | fila única id = 1 con nombre, país, moneda, tema, logos y ajustes | Un producto por cliente necesita sus datos en la base |
| modulos_instalacion | no existe | slug, activo, limites, activado_en, actualizado_en; solo la escribe el instalador | Módulos a la carta (PP-DEC-04) |
| user_notifications | project_id y subtask_id; link por defecto '/apps/proyectos'; update de toda la fila propia | sin project_id ni subtask_id (los añade el módulo proyectos); link por defecto '/'; authenticated solo actualiza read | Las dos columnas apuntan a tablas de módulo; marcar leído es lo único que hace el shell |
| push_notification() | 8 argumentos con proyecto y subtarea | (p_user, p_actor, p_kind, p_title, p_body, p_link) | Igual que user_notifications |
| avatares | bucket blog, carpeta avatars/<id> | bucket avatares, carpeta <id> | blog es del módulo sitio-web; el bucket propio deja acotar tipo y tamaño |
| bucket marca | no existe (los logos de las marcas van en blog/marcas) | público, sin SELECT, sube solo un administrador | Logos de la instalación (instalacion.logos) |
| portal_uso, acciones_resumen | día en America/Bogota | día en instalacion.zona_horaria (zona_instalacion()) | Una instalación por cliente, en su zona |
| seguridad_resumen() | v2 (71) con leads_24h | v2 sin leads_24h ni portal_apps y portal_credentials en cambios_24h | site_leads y la bóveda no son del núcleo; la v3 (97) llega como archivo nuevo |
