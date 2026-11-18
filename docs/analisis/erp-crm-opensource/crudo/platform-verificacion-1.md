# platform — verificación 1

Verificador con contexto fresco sobre los informes `platform-modulos.md`, `platform-rrhh.md`, `platform-extensibilidad.md` y `platform-integracion.md`. Repo leído: `C:\Users\enzov\IA\personal\investigacion-erp\platform` (Huly Platform). Todas las citas son rutas relativas a la raíz del repo. Solo lectura; los informes originales no se editaron.

Criterio: se abrió cada archivo citado en la línea citada y se intentó refutar la afirmación. CONFIRMADO: la cita dice eso. CORREGIDO: la idea es cierta pero la cita o un detalle estaban mal (se da la cita buena). DESCARTADO: no se sostiene. Los elementos «Hecho N» son la muestra de «Cómo lo resuelve»; los «An» son los de «Adoptable para Bash Logistics».

## Totales

| Informe | Revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| platform-modulos | 21 | 17 | 4 | 0 |
| platform-rrhh | 18 | 17 | 1 | 0 |
| platform-extensibilidad | 20 | 19 | 1 | 0 |
| platform-integracion | 25 | 22 | 3 | 0 |
| Total | 84 | 75 | 9 | 0 |

## platform-modulos

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 3 (activación = fila PluginConfiguration) | CONFIRMADO | `models/all/src/index.ts:573-594`; `foundations/core/packages/core/src/classes.ts:293-312` | El bucle guarda los ids de transacciones, `enabled`, `hidden`, `beta` y el id `plugin-configuration-<id>`. |
| Hecho 6 (solo el propietario activa) | CORREGIDO | `foundations/server/packages/middleware/src/pluginConfig.ts:60`; `plugins/setting-resources/src/components/Configure.svelte:32-33` y `:62` | Regla y `client.update(config, {enabled})` bien citados. El filtro de módulos visibles está en `Configure.svelte:62` (hidden, system); la línea 47 solo calcula el conteo para el rating. Las cuentas de sistema pasan sin control (`pluginConfig.ts:53-56`). |
| Hecho 7 (valores por defecto) | CONFIRMADO | `models/all/src/index.ts:191-440` (enabled true/false por módulo), `:342`, `:355`, `:368` (hidden) | Encendidos: contact, chunter, calendar, recruit, hr, tracker, document, questions, gmail. Apagados: lead, inventory, products, controlled-documents, training, survey. |
| Hecho 11 (permisos por tipo de espacio, no por módulo) | CORREGIDO | `models/core/src/permissions.ts:20-88`; `foundations/server/packages/middleware/src/spacePermissions.ts:93-150` (asignación de roles por espacio vía mixin `RolesAssignment`, `classes.ts:564`) y `:167-232` | El evaluador y el efecto «prohibir» son como se describe. Pero «no por módulo» es incompleto: existe `ModulePermissionGroup` (aplicación, rol de cuenta, permisos) en `foundations/core/packages/core/src/classes.ts:592-600`, usado en `guestPermissions.ts:58-94`. La asignación de rol por miembro no está en `security.ts:96-160` sino en `spacePermissions.ts:116-150`. |
| Hecho 13 (migraciones por estados nombrados) | CONFIRMADO | `models/lead/src/migration.ts:194-199`, `:176-185`; `foundations/core/packages/model/src/migration.ts:213` | `tryUpgrade` salta los estados ya registrados. |
| A1 registro de módulos como datos | CONFIRMADO | `models/all/src/index.ts:573-594`; `classes.ts:293-312` | — |
| A2 bandera `sistema` | CONFIRMADO | `foundations/core/packages/core/src/utils.ts:823`; `models/all/src/index.ts:197`, `:506` | Contact y billing llevan `system: true`. |
| A3 solo propietario, validado en servidor | CONFIRMADO | `pluginConfig.ts:60` | Rechaza escrituras sobre `PluginConfiguration` si el rol no es Owner. |
| A4 apagar oculta interfaz y conserva datos | CONFIRMADO | `models/all/src/index.ts:157-168`; `foundations/core/packages/client-resources/src/index.ts:185-194`; `utils.ts:832-870` | `classFilter` limita el descarte a clases de interfaz. |
| A5 manifiesto con dependencias (idea propia) | CONFIRMADO | `models/lead/package.json:44-52`; `Configure.svelte:31-35` | Dependencias de paquete; no se halló guarda en `Configure.svelte` ni en `plugins/setting-resources/src/utils.ts`. |
| A6 aplicación de menú con navegación declarativa | CONFIRMADO | `models/workbench/src/index.ts:45-55`; `models/lead/src/index.ts:79-143` | `accessLevel` aparece en los `specials` (`:108`, `:122`). |
| A7 ocultar aplicación por usuario | CONFIRMADO | `models/workbench/src/index.ts:63-66` | `HiddenApplication` es una `Preference`. |
| A8 mixins Cliente, Proveedor, Empleado | CONFIRMADO | `models/lead/src/types.ts:92-101`; `models/hr/src/index.ts:109-114`; `models/contact/src/index.ts:129`, `:210`, `:235` | Customer sobre Contact, Staff sobre Employee. |
| A9 catálogo de permisos y roles con «prohibir» | CONFIRMADO | `models/core/src/permissions.ts:20-88`; `models/lead/src/permissions.ts:10-17`; `models/products/src/roles.ts:20-57` | Se puede reforzar con `ModulePermissionGroup` (`classes.ts:592-600`). |
| A10 permisos por espacio | CONFIRMADO | `foundations/server/packages/middleware/src/spacePermissions.ts:93-150`, `:167-232` | La asignación rol-usuario-espacio está en `:93-114` y `:133-149`, no en `security.ts`. |
| A11 plantillas de estados con categoría fija | CONFIRMADO | `models/lead/src/spaceType.ts:24-79`, `:164-178`; `models/task/src/index.ts:175-228` | 8 estados con categorías UnStarted, Active (5), Won, Lost. |
| A12 migraciones y semillas por módulo al activarlo | CORREGIDO | `models/lead/src/migration.ts:34-58`, `:194-199`; `models/all/src/migration.ts:78` | Los pasos nombrados son ciertos. «Al activarlo» no: Huly corre las semillas en la actualización del espacio, desde una lista fija, sin mirar `enabled` (lead, apagado de fábrica, se siembra igual). Disparar semillas al activar es diseño de Bash Logistics. |
| A13 secuencias con prefijo | CONFIRMADO | `models/core/src/core.ts:420-432`; `models/lead/src/types.ts:70`; `models/lead/src/migration.ts:57` | El incremento atómico en Postgres es propuesta propia. |
| A14 registro de integraciones, secretos aparte | CORREGIDO | `models/setting/src/index.ts:60-68` (`Integration` con `value` en texto plano, `shared`, `error`); secretos en `server/account/src/types.ts:209-215` | El modelo del workspace guarda `value` sin cifrar; la separación de secretos que describe la nota está en el servicio de cuentas, no en `models/setting`. |
| A15 motor de procesos | CONFIRMADO | `models/process/src/index.ts:89-210`, `:224-240` | `Execution.rollback` en `:192`; `ApproveRequest` en `:224`. |
| A16 orden mínimo de módulos | CONFIRMADO | `models/all/src/index.ts:191-319`, `:254-287`, `:418-452` | Decisión de producto; las cifras de activación por defecto cuadran. |

## platform-rrhh

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 1 (Employee como mixin) | CORREGIDO | `models/contact/src/index.ts:255-281` | Los cinco campos son `@Hidden()`, pero solo `active` y `role` son `@ReadOnly()`; `statuses`, `position` y `timezone` no. La frase «todos de solo lectura» y la de «No conviene copiar» deben decir «ocultos; `active` y `role` de solo lectura». |
| Hecho 4 (alta automática como Staff) | CONFIRMADO | `server-plugins/hr-resources/src/index.ts:279-303` | Empleado activo, no invitado, sin Staff: mixin con `department: hr.ids.Head`. |
| Hecho 7 (`members` mantenido por disparadores) | CONFIRMADO | `server-plugins/hr-resources/src/index.ts:104-121`, `:134-162`, `:167-205` | Push al departamento y a sus ancestros, pull de los antiguos. |
| Hecho 9 (migración reconstruye members con protección de ciclos) | CONFIRMADO | `models/hr/src/migration.ts:108-152`, `:154-181` | `result.includes(current)` corta ciclos; dos pasos de reconstrucción. |
| Hecho 11 (tipos de ausencia con valor firmado) | CONFIRMADO | `models/hr/src/index.ts:227-309`, `:116-125` | 7 tipos: -1, -1, -1, -0,5, 1, 0,5, 0. |
| Hecho 14 (permisos de edición en el cliente) | CONFIRMADO | `plugins/hr-resources/src/components/ScheduleView.svelte:120-165`; `plugins/hr-resources/src/components/schedule/MonthView.svelte:188-190` | Lógica solo en Svelte, sin guarda en servidor. |
| Hecho 15 (correo a suscriptores del departamento y ancestros) | CONFIRMADO | `server-plugins/hr-resources/src/index.ts:336-386`, `:391-422`, `:460` | Respeta preferencias con `isAllowed`. |
| Hecho 16 (horas desde TimeSpendReport) | CONFIRMADO | `plugins/hr-resources/src/components/ScheduleView.svelte:181-217`; `models/tracker/src/types.ts:361-378` | — |
| A1 tipos de ausencia con factor firmado | CONFIRMADO | `models/hr/src/index.ts:227-309`, `:116-125` | — |
| A2 fecha civil | CONFIRMADO | `models/hr/src/index.ts:127-141`; `plugins/hr/src/index.ts:93-95` | — |
| A3 persona única con extensiones por rol | CONFIRMADO | `models/contact/src/index.ts:210-226`, `:255-281`; `models/recruit/src/types.ts:103-142` | — |
| A4 departamento en árbol con raíz fija | CONFIRMADO | `models/hr/src/index.ts:70-107`; `models/hr/src/migration.ts:40-58`; `models/hr/src/index.ts:348-366` | La raíz se excluye del borrado con `_id: {$nin: [hr.ids.Head]}`. |
| A5 permisos por ascendencia | CONFIRMADO | `ScheduleView.svelte:120-165` | El original depende de `members` materializado, que incluye descendientes. |
| A6 no materializar `members` | CONFIRMADO | `server-plugins/hr-resources/src/index.ts:104-274`; `models/hr/src/migration.ts:108-152` | — |
| A7 festivos por departamento | CONFIRMADO | `models/hr/src/index.ts:179-186` | — |
| A8 avisos a suscriptores | CONFIRMADO | `server-plugins/hr-resources/src/index.ts:336-425` | — |
| A9 horas imputadas junto a ausencias | CONFIRMADO | `ScheduleView.svelte:181-217`; `models/tracker/src/types.ts:361-378` | Solo cuenta las imputaciones con tarea resuelta (`:200-207`). |
| A10 estados temporales | CONFIRMADO | `models/contact/src/index.ts:246-253` | — |
| A11 calendario mensual como pantalla principal | CONFIRMADO | `plugins/hr-resources/src/components/ScheduleView.svelte`; `.../schedule/MonthView.svelte` | Sin línea citada; los archivos existen y muestran el mes por persona. |
| A12 bloqueo de meses pasados | CONFIRMADO | `MonthView.svelte:180-190` | Editable si está en la lista y es mes en curso o futuro, o el usuario es Owner o admin; solo cliente. |

## platform-extensibilidad

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 1 (esquema como documento) | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:108-115`, `:212`, `:220`, `:279`; `models/core/src/core.ts:213`, `:235`, `:241` | Las tres con `DOMAIN_MODEL`. |
| Hecho 2 (campo personalizado = Attribute `isCustom`) | CONFIRMADO | `plugins/setting-resources/src/components/CreateAttribute.svelte:64-85`; `classes.ts:220-234` | Nombre `'custom' + generateId()`. |
| Hecho 12 (filtros guardados, compartibles) | CONFIRMADO | `plugins/view/src/types.ts:110-121`; `models/view/src/index.ts:124-136`; `plugins/view-resources/src/components/filter/FilterSave.svelte:30-41`; `FilterBar.svelte:46` | — |
| Hecho 15 (modelo = transacciones de sistema + usuario, hash) | CONFIRMADO | `foundations/server/packages/middleware/src/model.ts:84-121`, `:123-146`, `:148-157`, `:168-178` | — |
| Hecho 16 (JSONB para el resto de campos) | CONFIRMADO | `foundations/server/packages/postgres/src/utils.ts:155-175`; `.../schemas.ts:21-62`; `foundations/server/packages/core/src/domainHelper.ts:46-50` | — |
| Hecho 17 (permisos por tipo; solo configuración protegida) | CORREGIDO | `foundations/server/packages/middleware/src/configuration.ts:39`, `:56-67`; `pluginConfig.ts:60`; `guestPermissions.ts:136-138`, `:295-346` | El dominio de configuración se protege en `:39` y `:56-67` (la línea 34 es el correo del configurador). La palabra «solo» es falsa: hay además `PluginConfigurationMiddleware`, `GuestPermissions` con `TxAccessLevel` y `SpacePermissions`. La duda sobre quién crea `Attribute` en `core.space.Model` sigue sin resolver. |
| A1 campos como metadata más `jsonb` | CONFIRMADO | `classes.ts:220-235`; `CreateAttribute.svelte:64-85`; `postgres/src/utils.ts:155-175` | — |
| A2 registro de tipos de campo | CONFIRMADO | `CreateAttribute.svelte:89-100`; `models/view/src/index.ts:1084-1124` | — |
| A3 listas de opciones compartidas | CONFIRMADO | `classes.ts:212-215`, `:405-407`; `EditEnum.svelte:55` | — |
| A4 campos personalizados en filtros y orden | CONFIRMADO | `plugins/card-resources/src/components/settings/view/ViewOptionsButton.svelte:34-83`; `plugins/view-resources/src/filter.ts:51-100` | La lógica está en el cliente y solo para vistas de tarjetas. |
| A5 vista con tres alcances | CONFIRMADO | `plugins/view/src/types.ts:110-121`, `:455-467`, `:738-741`; `FilterSave.svelte:30-41` | — |
| A6 filtros como JSON con lista blanca | CONFIRMADO | `plugins/view/src/types.ts:96-105`; `filter.ts:51-100` | En Huly la traducción a consulta se hace en el cliente; que la haga el servidor es propuesta propia. |
| A7 modos de fecha con nombre | CONFIRMADO | `plugins/view-resources/src/filter.ts:103-170` | Vencido, hoy, ayer, semana, mes (y siguientes), sin fecha, personalizado. |
| A8 descriptor de vista | CONFIRMADO | `plugins/view/src/types.ts:338-340`, `:455-467`; `models/view/src/index.ts:641-702`; `models/task/src/index.ts:330-339`; `models/calendar/src/index.ts:324-333` | — |
| A9 kanban con estados por tipo | CONFIRMADO | `plugins/task/src/index.ts:113-130`; `CreateTaskType.svelte:117-135` | — |
| A10 tipos de registro definidos por el instalador | CONFIRMADO | `plugins/card/src/index.ts:38-73`; `plugins/card-resources/src/components/CreateTag.svelte:32-43` | — |
| A11 herencia ligera de tipos | CONFIRMADO | `plugins/card/src/index.ts:38-46`; `CreateTag.svelte:35-38` | `extends: parent?._id ?? card.class.Card`. |
| A12 relaciones definidas por el usuario | CONFIRMADO | `classes.ts:136-152`; `plugins/setting-resources/src/components/CreateRelation.svelte:101-112` | — |
| A13 hash de modelo y descarga incremental | CONFIRMADO | `model.ts:84-121`, `:148-157` | — |
| A14 bloqueo de lo que define el sistema | CONFIRMADO | `models/card/src/index.ts:330-355`; `CreateAttribute.svelte:72` | — |

## platform-integracion

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 1 (API genérica find-all, tx, etc.) | CONFIRMADO | `pods/server/src/rpc.ts:263`, `:295`, `:337`, `:344`, `:377`, `:406`, `:324-326`; `services/github/github.graphql` | Sin GraphQL propio; el `.graphql` es del conector de GitHub. |
| Hecho 2 (control de cuota en el cliente) | CONFIRMADO | `foundations/core/packages/api-client/src/rest/rest.ts:159-198`; `pods/server/src/rpc.ts:66-78` | Se frena con menos de un tercio de cuota. |
| Hecho 4 (tokens de API acotados) | CONFIRMADO | `server/account/src/operations.ts:2735-2739`, `:2750-2818`; `server/account/src/utils.ts:276-283`; `server/account/src/types.ts:173-183` | El token guardado es un JWT; el hash del token es propuesta de Bash Logistics. |
| Hecho 5 (tokens de solo lectura) | CONFIRMADO | `services/export/pod-export/src/server.ts:310`, `:508`; `foundations/server/packages/middleware/src/guestPermissions.ts:136-138`; `server/account/src/utils.ts:959` | `extra.readonly = 'true'` se genera en cuentas. |
| Hecho 6 (webhooks solo entrantes y solo de pasarelas) | CORREGIDO | `services/payment/pod-payment/src/providers/stripe/webhook.ts:41-90`; `.../polar/webhook.ts`; `services/love/src/main.ts:105`; `services/telegram-bot/pod-telegram-bot/src/start.ts:72` | La firma, los códigos 400 y 403 y el procesamiento asíncrono son ciertos. «Solo de pasarelas de pago» es falso: también hay webhooks entrantes de LiveKit (love) y de Telegram, además de GitHub y los canales push de Google. Salientes configurables no se hallaron. |
| Hecho 7 (exportación CSV y JSON) | CONFIRMADO | `services/export/pod-export/src/server.ts:258`, `:290`, `:345`, `:352-364`, `:389`; `.../csv/csv-serializer.ts:34-39`, `:61-63` | No hay biblioteca ni archivos de hoja de cálculo; `pods/preview/src/providers/doc.ts:33` solo mapea el tipo MIME. |
| Hecho 10 (importador ClickUp) | CORREGIDO | `packages/importer/src/clickup/clickup.ts:115-116`, `:159-175` (errores en `:163`, `:173`); `dev/import-tool/docs/clickup/README.md` (User Mapping, Limitations) | La jerarquía por `Parent ID` está en `:159-175`, no en `:141-173` (esas líneas arman proyectos y estados). El resto es exacto. |
| Hecho 13 (calendario incremental con syncToken) | CONFIRMADO | `services/calendar/pod-calendar/src/sync.ts:233-272`, `:628-661`; `.../main.ts:135-158`; `plugins/calendar/src/index.ts:185`, `:309` | Ante 410 descarta el token y resincroniza. |
| Hecho 15 (enlaces públicos y roles de invitado) | CONFIRMADO | `models/guest/src/index.ts:10-17`; `plugins/guest/src/index.ts:16-21`; `foundations/core/packages/core/src/classes.ts:605-613`; `guestPermissions.ts:48-94`, `:287-318`; `server/account/src/operations.ts:158-176` | — |
| Hecho 17 (i18n por plugin con respaldo a inglés) | CONFIRMADO | `plugins/contact-assets/lang/es.json:1-12`; `foundations/core/packages/platform/src/i18n.ts:141-170`; `server/server-pipeline/src/internationalization.ts:85-127` | 14 idiomas en `contact-assets`; en el servidor solo se registran las cadenas en inglés. |
| A1 tokens con vigencia, revocación y tope | CONFIRMADO | `operations.ts:2750-2818`; `utils.ts:276-283`; `types.ts:173-183` | — |
| A2 token de solo lectura | CONFIRMADO | `export/src/server.ts:310`; `guestPermissions.ts:136-138` | — |
| A3 cabeceras de cuota y Retry-After | CONFIRMADO | `pods/server/src/rpc.ts:66-78`; `rest.ts:159-198` | — |
| A4 exportación CSV con transformación y entrega asíncrona | CONFIRMADO | `csv-serializer.ts:30-48`; `services/export/pod-export/src/transformer.ts:24-72`; `export/src/server.ts:290-364` | Sin manejo de BOM en el repo, como dice la nota. |
| A5 importador con modelo intermedio y validación | CONFIRMADO | `packages/importer/src/huly/schema.ts:16-135`; `packages/importer/src/importer/importer.ts:1383-1425` | La validación por fila antes de insertar es propuesta propia. |
| A6 conservar id externo al importar | CONFIRMADO | `importer.ts:1394`; `export/src/server.ts:478`, `:498` | `skip` y `duplicate` son de `export-to-workspace`, no del importador. |
| A7 mapeo de usuarios con degradación explícita | CORREGIDO | `dev/import-tool/docs/clickup/README.md` (User Mapping); `packages/importer/src/clickup/clickup.ts:124-125`, `:214`, `:239`, `:289-310` | La cita `:141-173` es la jerarquía de tareas. El mapeo por nombre y correo está en las líneas indicadas; lo no encontrado queda como texto `ClickUp assignees` (`:239`). |
| A8 calendario incremental | CONFIRMADO | `sync.ts:233-272`, `:628-661`; `services/calendar/pod-calendar/src/watch.ts` | — |
| A9 evento con recurrencia RFC 5545 | CONFIRMADO | `plugins/calendar/src/index.ts:68-129` | Reglas, `exdate`, `rdate`, `timeZone`, participantes externos como texto. |
| A10 hilos por Message-ID e In-Reply-To | CONFIRMADO | `services/mail/mail-common/src/thread.ts:56-66`, `:102-112` | El mapa usa un almacén clave-valor, como dice el informe. |
| A11 enlace público revocable | CONFIRMADO | `models/guest/src/index.ts:10-17`; `plugins/guest/src/index.ts:16-21` | — |
| A12 identidad de contacto desacoplada | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:1013-1026` | — |
| A13 secretos en tabla aparte | CONFIRMADO | `server/account/src/types.ts:200-217` | — |
| A14 textos por módulo con respaldo | CONFIRMADO | `i18n.ts:141-170`; `plugins/contact-assets/lang/es.json:1-12`; `internationalization.ts:85-127` | — |
| A15 firma de webhook sobre cuerpo crudo | CONFIRMADO | `stripe/webhook.ts:39-66`, `:69-90` | Cuerpo `Buffer` con `express.raw`; 400 sin firma, 403 con firma inválida; sin idempotencia por id de evento. |
| A16 importación de todo o nada | CONFIRMADO | `clickup.ts:163`, `:173` | El contraejemplo es correcto: lanza error al primer padre ausente. |
