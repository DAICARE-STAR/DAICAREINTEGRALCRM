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

## Mapa de renombres

Se escribe una sola vez al copiar (PR-2) y vive en `tools/origen/mapa-renombre.json`: primitivas `--ld-*` a `--pal-*`, semánticos `--gold*` a `--acento*`, temas `marfil`, `hueso` y `enfasis` a `claro`, `calido` y `oscuro`, claves de `localStorage` `ld_*` a `pt_*_v1`.

## Portes de módulo

Cada módulo se reescribe en su fase leyendo team-portal en el hash de ese momento.

| Módulo | Fase | Hash de team-portal | Fecha | Notas |
|---|---|---|---|---|
| (ninguno todavía) | | | | |

## Divergencias de esquema

Nombres de tabla y columna que el producto cambia respecto de team-portal (por defecto se conservan).

| Objeto | team-portal | Producto | Motivo |
|---|---|---|---|
| portal_apps | tabla de apps con «Visible para» | no viaja | Sin iframe no hay URL que registrar; nombre, icono y orden salen de src/lib/modulos.ts (puede_ver_app v2 llega en 04) |
| roles.funcion | no existe (team-portal busca roles por nombre: leads, perdidas, bot, claude-dev) | text null con check aviso_leads, aviso_perdidas o qa y un rol por función | TP-6 de serie; bot no viaja. El freno de escalada protege is_system o funcion not null |
| profiles.es_servicio | no existe (cuentas de servicio por lista de correos) | boolean not null default false; solo lo cambia un administrador o la service role | TP-6 de serie; cuentas_servicio_ids() la lee |
| connectors.url | text sin check | check http(s) sin espacios, comillas ni < > | Es el href de «Abrir»: nunca javascript: ni data: |
| instalacion | no existe (los datos de la empresa viven en el código) | fila única id = 1 con nombre, país, moneda, tema, logos y ajustes | Un producto por cliente necesita sus datos en la base |
| modulos_instalacion | no existe | slug, activo, limites, activado_en, actualizado_en; solo la escribe el instalador | Módulos a la carta (PP-DEC-04) |
| seguridad_resumen() | v2 (71) con leads_24h | v2 sin leads_24h ni portal_apps y portal_credentials en cambios_24h | site_leads y la bóveda no son del núcleo; la v3 (97) llega como archivo nuevo |
