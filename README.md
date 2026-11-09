# portal-producto

ERP modular para pymes nacido del Team Portal: shell React, Supabase y Netlify Functions, una instalación por cliente con módulos a la carta. Nombre provisional; el nombre visible por defecto es «Portal del equipo».

## Cómo correrlo

1. `npm install` (Node 22.12 o superior; en el PC, Node 24).
2. Copiar `.env.example` a `.env` y llenar las variables de la instalación. Los valores secretos solo viven en `.env` y en el gestor de contraseñas.
3. Desarrollo: `npm run dev` (puerto 5190). Build y vista previa del build con la CSP del shell: `npm run preview:build` (puerto 4190). Desde Claude Code se usan las entradas `portal-producto` y `portal-producto-build` de `.claude/launch.json`.

Verificación: `npm run typecheck`, `npm test`, `npm run build`, `npm run secretos` (escáner de secretos; sale 0 sin hallazgos).

## Instalación por cliente

Una instalación por cliente: su proyecto Supabase y su sitio Netlify (PP-DEC-01). Lo hace quien instala, en su PC; las variables y su clase están en `docs/instalacion/variables.md` y la lista de control en `docs/seguridad/04-checklist-despliegue.md`.

1. Crear el proyecto Supabase del cliente (plan Free sirve para empezar).
2. En Auth: cerrar el registro público y activar TOTP.
3. Poner `SUPABASE_DB_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el `.env` local (nunca como argumento).
4. `npm run instalar` (aplica 00 a 09) y `node tools/instalar/aplicar.mjs --verificar`: ninguna línea DIFIERE.
5. `node tools/instalar/cuentas-prueba.mjs` y correr `supabase/pruebas/rls-simulacion.sql` en el SQL Editor: ninguna FALLA.
6. Activar los módulos contratados: `node tools/instalar/modulos.mjs --listar` y `--activar <slug>` (`docs/modulos.md` lista los que hay).
7. Crear el sitio Netlify desde el repo y cargar las variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PORTAL_NOMBRE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `VAPID_SUBJECT`, `GEMINI_MODEL`, `IA_MODELO_BLOG_DRAFT`, `IA_MODELO_LEAD_REPLY`). `URL` la pone Netlify.
8. Generar las claves VAPID con `npx web-push generate-vapid-keys` y cargar `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
9. Invitar al primer administrador desde Auth (o con `invitar-miembro` una vez haya uno) y darle el rol admin.
10. Con ese administrador, configurar la Instalación en Administración: datos de la empresa, logos y tema.

Solo en el PC de quien instala, para los scripts de verificación: `CLAUDE_DEV_EMAIL`, `CLAUDE_DEV_PASSWORD` y `PORTAL_URL`. Para una demostración, `supabase/esquema/datos/demo-nucleo.sql` (solo datos, marcados «[demo]») se corre a mano después del paso 4.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `src/` | Shell React (copia de origen, docs/origen.md): `pages/`, `components/`, `context/`, `lib/` lógica pura con pruebas en `__tests__/`, `estilos/` tokens y temas |
| `netlify/` | Funciones de servidor y su código común; pruebas de contrato en `__tests__/` |
| `supabase/esquema/` | Esquema consolidado por dominio que aplica el instalador |
| `supabase/pruebas/` | Simulación de RLS (`rls-simulacion.sql`) sobre las cuentas de `tools/instalar/cuentas-prueba.mjs` |
| `tools/seguridad/` | Escáner de secretos |
| `tools/instalar/` | Instalador del esquema (`aplicar.mjs`) y de los módulos de la instalación (`modulos.mjs`); cuentas de prueba (`cuentas-prueba.mjs`) |
| `tools/origen/` | Mapa de renombre y `renombrar.mjs`, el script de un solo uso del commit de origen |
| `docs/` | Origen del código, portes, glosario, flujo entre IA, instalación, seguridad y `modulos.md` (generado por `tools/producto/documentar-modulos.mjs`) |
| `GUIA-UI.md` | Reglas de interfaz y componentes compartidos |

## Estado

Creado el 2026-11-07 en el área personal. El estado vigente está en `HANDOFF.md` y la historia en `CHANGELOG.md`. Las decisiones del proyecto (PP-DEC) están en `AGENTS.md`.
