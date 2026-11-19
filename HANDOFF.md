# Handoff — Bash Logistics

Estado vigente al 2026-11-17 (hora de Bogotá). Lo mantiene la sesión directora: se actualiza al cerrar cada lote u ola, antes de lanzar el siguiente. Sin secretos ni datos de personas.

## Qué es esta sesión

Directora: orquesta agentes de investigación, desarrollo y pruebas de Bash Logistics. No toca el código del portal de origen; eso lo lleva la sesión «Portal hardening, productos y perfiles». Los informes de los agentes van a archivos, no al chat. El producto se llama Bash Logistics (PP-DEC-27): el nombre anterior no se usa en ningún sitio y una prueba de `neutralidad.test.ts` lo vigila.

## Estado de los repos

| Repo | Carpeta | Estado |
|---|---|---|
| Bash Logistics (producto) | `personal/portal-producto` | `main` en 0.2.28 (4f9441f). En GitHub (`valdrighilorenzo-star/Bash_Logistics`) hasta 0.2.27 (41bd22d). Sin subir: 0.2.28 y el commit de este handoff. `docs/analisis/crm-trycompai.md` sin versionar, de otra sesión (solo se le cambió el nombre del producto). |
| CRM de DAI CARE | `clientes/daicare-crm` | En 0.2.16, subido a GitHub el 2026-11-17 (publica en Netlify, app.daicareintegral.com; deploy sin comprobar). Su base tiene 13 archivos aplicados y la simulación en 96 OK. No tiene el lote 1. |
| Portal de origen | lo lleva su sesión | 1.12.49 y 1.12.50 publicados. El arreglo del perfil (ayudante de campos de personas, sin ejemplos) lo tenía hecho sin comitear, a la espera del recorrido en navegador; iba como 1.12.53. |

## Bases de datos

- **Pruebas**: proyecto Supabase propio del usuario (ref gfcusptkdcxatmsszgwk, organización Memento; el conector de Supabase de la sesión no lo ve). `.env` en `personal/portal-producto`, lo rellenó el usuario; no se lee. 19 archivos de esquema aplicados (núcleo, 00b, 01b, 09b, 09c, CRM 21 a 21d), `--verificar` 18 de 18, simulación 131 OK, 0 FALLA, 0 OMITIDO. Cuentas de prueba: testadmin, testmiembro y testqa en enzo.com.
- **DAI CARE**: 13 archivos (hasta 21b), simulación 96 OK. Para llevarle el lote 1: primero `npm.cmd run instalar` y `modulos.mjs --activar crm` en su base (aplica 00b, 01b, 09b, 09c, 21c, 21d), `--verificar`, simulación, y solo entonces publicar su frontend. En el orden inverso nadie puede exportar del CRM.
- Herramientas nuevas: `tools/instalar/simular.mjs` corre la simulación desde la terminal; `tools/instalar/diagnostico-url.mjs` revisa la forma de SUPABASE_DB_URL sin mostrarla. La contraseña de la base no debe llevar símbolos.

## Demo en Netlify

`https://dapper-sherbet-abfa4a.netlify.app`, sitio del usuario enlazado a `main` del repo del producto, contra la base de pruebas. **Incidente abierto**: en `VITE_SUPABASE_ANON_KEY` quedó pegada la clave secreta del proyecto de pruebas y está en el bundle público (comprobado en el sitio; por eso el login falla). Arreglo de código hecho en 0.2.28: el build descarta una clave secreta de esa variable (`src/lib/clave-supabase.ts`, `vite.config.ts`) y el login lo avisa; probado con una clave falsa. **Falta subir 0.2.28**: el push quedó bloqueado por falta de orden expresa y el usuario cerró la sesión sin responder; es lo primero que hay que preguntarle al retomar. Tras el push: comprobar en el sitio que el bundle ya no trae ninguna clave secreta (buscar el prefijo seguido de caracteres, no el prefijo solo, que ahora está en el código). Aparte, lo hace el usuario porque la directora no maneja claves: borrar la secreta en Supabase y crear otra, poner la clave publishable en `VITE_SUPABASE_ANON_KEY` y la secreta nueva en `SUPABASE_SERVICE_ROLE_KEY` de Netlify y del `.env` local, y redesplegar con caché limpia. Los despliegues viejos de Netlify siguen accesibles por su enlace: por eso hay que rotar. También falta la Site URL en Auth. La contraseña de testadmin la cambió el usuario por SQL.

## Backlog y lotes

El usuario pidió aplicar las 73 propuestas de `docs/analisis/erp-crm-opensource/backlog.md` (corregido por la revisión crítica; resumen navegable en un Artifact privado del usuario). Flujo: cada lote en una rama de pruebas con worktree propio, implementación, revisión independiente y corrección por unidad, esquema aplicado en la base de pruebas, simulación, y a `main` con el visto bueno del usuario.

- **Lote 1 (núcleo), hecho** (0.2.21 a 0.2.25): módulos sin esquema a planeado y dependencias blandas (PP-DEC-21 y 22); guarda del último administrador y exportar como permiso propio; contrato base de tabla y moneda como par (PP-DEC-23 y 24); numeración de documentos y máquina de estados (PP-DEC-25 y 26).
- **Renombre, hecho** (0.2.26 y 0.2.26b): PP-DEC-27, prefijo de campos `bl-`.
- **Pendientes que dejó el lote 1, para el lote 2**: quien tiene `app_crm` sin `exportar_crm` aún puede recorrer `crm_buscar` por la API; la guarda del último administrador no cubre el bloqueo ni el borrado suave en Auth; el servidor (`exigir`, `moduloActivo`, `has_modulo`) no aplica la regla de planeados que sí aplica el shell.
- **Lote 2 (CRM 0.2), siguiente**: visibilidad «lo mío o sin asignar» en las seis políticas de lectura, aviso de duplicados con función de base, catálogos con clave inmutable, tipo de documento DIAN, última actividad, ajustes de módulo en el registro, varios canales por cuenta, recordatorios, línea de tiempo.
- **Decisiones abiertas** (D-1 a D-19 en `comparativa.md`): antes del primer módulo ERP, D-2 con D-3 (terceros: la opción recomendada es un tercero neutral fuera del CRM), D-14, D-15 y D-19. D-5 (notas crédito) es pregunta abierta al usuario y su asesor contable; no se toca hasta facturación.
- Por decidir con el usuario: nombre corto de la app instalada (hoy «Bash Logistics», 14 caracteres; el móvil corta hacia los 12).

## Reparto de modelos y consumo

Lectura masiva y verificación: Sonnet. Síntesis, implementación y revisión: Opus. Fable solo en la directora. Reserva del 10 % semanal; se mide entre lotes y, si el semanal pasa de 75 %, lo que falte espera al reinicio del 2026-11-21. Gastado el 2026-11-17: análisis de cinco repos 12 M de tokens, crítica 2,5 M, lote 1 1,9 M, renombre 0,4 M. Semanal al 60 % antes del lote 1.

## Reglas que no se olvidan

- No leer `.env`, ni las carpetas de respaldo y claves vetadas en las reglas personales. Las credenciales las teclea el usuario.
- Push a `main`, deploy y cualquier acción difícil de revertir: solo con orden explícita. En la base de pruebas el esquema lo aplica la directora; en la del cliente, solo con orden.
- Sin tareas programadas ni polling.
- Las áreas no se mezclan: nada del portal de origen en el producto ni en los clientes. Datos de salud y de personas del cliente, nunca en el chat.
- Un archivo de esquema ya aplicado no se edita: las correcciones van en archivos con letra.
- Un agente puede negarse a comitear si no ve la orden del usuario: decirle en el encargo que el commit viene de la directora por encargo expreso.
- En PowerShell, `npm.cmd`. Los scripts con barras invertidas se escriben como archivo, no en heredoc.

## Al retomar

1. Preguntar si se sube 0.2.28 (saca la clave del sitio) y verificar la demo.
2. Confirmar que el usuario rotó la clave y corrigió las variables; revisar login con testadmin.
3. Lanzar el lote 2 (CRM) en una rama de pruebas nueva con worktree propio (no reutilizar nombres viejos).
4. Pendientes del usuario: nombre corto de la app, decisiones D-2, D-3, D-14, D-15 y D-19, llevar el lote 1 a DAI CARE (esquema antes que frontend), comprobar el deploy de app.daicareintegral.com y Editar perfil en su Chrome.

## Fase 0.7 (abierta el 2026-11-19)

Plan aprobado: Productos, luego Inventario, luego Terceros y Compras. Rama `pruebas/fase-0.7` en el worktree `personal/wt/bash-pruebas` (node_modules es un junction: desmontarlo antes de quitar el worktree). Método por módulo: diseño con crítica de dos lentes, decisiones de negocio con el usuario, esquema ensayado con `tools/instalar/ensayar.mjs --simular <slug>` (transacción que se deshace), revisión por dos lentes y corrección, aplicación real por la directora, pantallas, revisión y corrección.

- **Productos, hecho en la rama** (0.7.1 a 0.7.4b, e9fab41): diseño en `docs/modulos/productos.md`; `22-catalogo.sql` con siete tablas (productos, unidades, conversiones, categorías, clases de impuesto, historial, registro de líneas), `productos_buscar`, `productos_importar` y `productos_aplicar_linea` (la usarán las líneas de los documentos de Inventario, Compras y Ventas para congelar unidad, factor e impuesto); módulo `disponible` con lista, ficha, catálogos e importador en `src/modulos/productos/`. Decisiones del usuario: código manual o automático (P-00001), precio de lista sin IVA, una clase de impuesto por producto, marcas se vende y se compra. Fijadas por defecto y avisadas: el código de un archivado no se cambia ni se reutiliza mientras exista; un producto conserva su unidad base y su clase aunque se archiven; la autoría es visible para los módulos lectores; clases de impuesto solo de Colombia.
- **Base de pruebas**: 20 archivos, `--verificar` en OK, simulación 163 OK, 0 FALLA, 0 OMITIDO, módulo productos activo.
- **Sin comprobar**: ninguna pantalla de Productos se ha visto en un navegador (hace falta sesión con una cuenta de prueba; la contraseña la escribe el usuario). Pendiente de la revisión: un precio de más de 15 cifras significativas puede perder precisión en el cliente; la exportación pagina por desplazamiento.
- **Demo de Netlify**: 0.2.28 subido el 2026-11-19; el sitio quedó con «Team protection» (responde 401), así que no se pudo verificar el bundle. La rotación de la clave secreta sigue siendo del usuario.
- **Siguiente**: integrar la rama en main con el visto bueno del usuario; Inventario (`24-inventario.sql`) tras el reinicio semanal del 2026-11-21; después Terceros (tabla propia fuera del CRM, decisión por defecto) y Compras.
- Consumo el 2026-11-19: Productos completo unos 2,9 M de tokens; semanal en 80 % antes de las pantallas.
