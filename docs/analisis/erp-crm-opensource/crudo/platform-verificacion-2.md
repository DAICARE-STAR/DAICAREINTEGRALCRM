# platform — verificación 2

Verificador con contexto fresco sobre los informes `platform-crm.md`, `platform-permisos.md` y `platform-automatizacion.md` (Huly Platform, EPL-2.0). Rutas relativas a la raíz de `investigacion-erp/platform`. Se abrió cada archivo citado y se intentó refutar la afirmación. Solo lectura; los informes originales no se tocaron. Veredictos: CONFIRMADO, CORREGIDO (idea cierta, cita o detalle malo) y DESCARTADO (no se sostiene).

## Totales

| Informe | Elementos revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| platform-crm | 24 (16 A + 8 hechos) | 23 | 1 | 0 |
| platform-permisos | 26 (16 A + 10 hechos) | 17 | 8 | 1 |
| platform-automatizacion | 26 (16 A + 10 hechos) | 25 | 1 | 0 |
| Total | 76 | 65 | 10 | 1 |

## platform-crm

### Adoptable

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 cliente como rol (mixin) | CONFIRMADO | `models/lead/src/types.ts:92-101`; `plugins/lead-resources/src/components/CreateLead.svelte:115-122` | El mixin Customer se crea sobre el contacto si falta, antes de agregar el lead (`:125`). |
| A2 etapas como datos con categoría | CONFIRMADO | `models/lead/src/spaceType.ts:24-79`; `server-plugins/task-resources/src/index.ts:23-54`; `plugins/task/src/index.ts:272-279` | Al crear solo marca `isDone` si es ganada o perdida; reabre únicamente en cambio de estado. Ver hecho 6: son cinco categorías. |
| A3 rango tipo lexorank | CONFIRMADO | `foundations/core/packages/rank/src/utils.ts:36-62`; `models/task/src/index.ts:117-120` | `makeRank` usa `between`, `genNext`, `genPrev` de LexoRank. |
| A4 aviso de duplicados | CONFIRMADO | `plugins/contact/src/utils.ts:169-243`; `plugins/lead-resources/src/components/CreateCustomer.svelte:162-169` | Busca por valor de canal; el nombre con `$like` solo si no hubo canal; canal suma 2 y nombre exacto 1. |
| A5 fusión campo por campo | CONFIRMADO | `plugins/contact-resources/src/components/MergePersons.svelte:122-179`, `:273-346`; `plugins/contact-resources/src/visibilityTester.ts:26-31` | Solo con mixin Employee; reescritura de referencias en lotes de 100 fuera de la transacción de canales. |
| A6 canales como filas hijas | CONFIRMADO | `models/contact/src/index.ts:167-182`, `:763-773` | Campos provider, value, lastMessage; proveedores como documentos del modelo. |
| A7 atributos por tipo de oportunidad | CONFIRMADO | `plugins/task/src/index.ts:113-130`; `models/lead/src/spaceType.ts:141-162` | `targetClass` guarda los atributos del usuario. |
| A8 número legible por tipo | CONFIRMADO | `plugins/lead-resources/src/components/CreateLead.svelte:87-96`, `:101`; `foundations/core/packages/core/src/classes.ts:685-688`; `models/task/src/migration.ts:64-71` | Incremento hecho en el cliente, como dice el informe. |
| A9 historial más comentarios en una línea | CONFIRMADO | `plugins/activity/src/index.ts:97-106`; `models/lead/src/index.ts:47-61` | La cita original `:50-63` arranca a mitad del bloque; el bloque real es 47-61. |
| A10 colaboradores automáticos | CONFIRMADO | `models/lead/src/index.ts:391-410`, `:543-546` | Colaboradores `createdBy` y `assignee`. |
| A11 equipo como miembros con rol por embudo | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:495-505`, `:541-558`; `models/lead/src/spaceType.ts:91-95` | Los permisos del embudo son solo UpdateSpace, ArchiveSpace y ForbidDeleteObject; los roles «ve todo / ve lo suyo / solo lectura» son diseño de Bash Logistics, no existen en Huly. |
| A12 pantalla Mis oportunidades | CONFIRMADO | `models/lead/src/index.ts:90-98` | Vistas assigned, created, subscribed. |
| A13 tarea de seguimiento ToDo | CONFIRMADO | `plugins/time/src/index.ts:54-68` | Apunta a cualquier documento; prioridad, vencimiento, usuario, rango. |
| A14 relaciones libres | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:136-152` | Association con cardinalidad y Relation de pares. |
| A15 reclutamiento como variante del embudo | CONFIRMADO | `models/recruit/src/types.ts:151-178`; `models/recruit/src/spaceType.ts:24-72` | Applicant hereda de la tarea; etapas por defecto. |
| A16 reglas por transición como datos | CONFIRMADO | `plugins/process/src/index.ts:41-52`, `:78-86`, `:115-125` | Process, Transition, Execution tal como se describen. |

### Hechos de «Cómo lo resuelve»

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 2 (lead sin monto ni probabilidad) | CONFIRMADO | `models/lead/src/types.ts:69-90`; `plugins/lead/src/index.ts:55-61`; `models/task/src/index.ts:109,115,120,138` | Solo título, inicio, estado, responsable, cliente; sin monto. |
| Hecho 3 (cliente como mixin, se crea a demanda) | CONFIRMADO | `models/lead/src/types.ts:92-101`; `CreateLead.svelte:115-125` | Coincide. |
| Hecho 5 (etapas por defecto) | CONFIRMADO | `models/lead/src/spaceType.ts:24-79` | Las ocho etapas y sus categorías coinciden. |
| Hecho 6 (cuatro categorías de etapa) | CORREGIDO | `models/task/src/index.ts:380-443` (UnStarted, ToDo, Active, Won, Lost); `plugins/task/src/index.ts:272-279` | Son cinco, no cuatro: falta ToDo («por hacer»). Que solo ganada y perdida cierran sí es cierto. Las citas 386/414/428/442 son las líneas de id, no del bloque. |
| Hecho 7 (trigger de isDone) | CONFIRMADO | `server-plugins/task-resources/src/index.ts:23-54` | Matiz: al crear no reabre; solo en cambio de estado. |
| Hecho 15 (duplicados por canal y nombre) | CONFIRMADO | `plugins/contact/src/utils.ts:169-243`; `CreateCustomer.svelte:162-169`, `:277-283` | La interfaz muestra `matches[0]`. |
| Hecho 16 (fusión solo empleados) | CONFIRMADO | `visibilityTester.ts:26-31`; `MergePersons.svelte:122-179`, `:273-346`; `models/contact/src/index.ts:1201-1225` | La acción registrada está en 1201-1225, no 1199-1224 (desfase de dos líneas); apunta solo a `contact.class.Person`. |
| Hecho 21 (inventario sin precio) | CONFIRMADO | `plugins/inventory/src/index.ts:24-44` | Product con nombre y variantes; Variant con nombre y sku. |

## platform-permisos

### Adoptable

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 roles con peso numérico | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:605-626`; `foundations/core/packages/core/src/utils.ts:801-803` | Pesos 5, 10, 20, 30, 40, 50, 100 y `hasAccountRole` por comparación. |
| A2 no otorgar rol superior al propio | CONFIRMADO | `server/account/src/utils.ts:1849-1862`; `server/account/src/operations.ts:722-723` (también `:781`, `:856`, `:926`, `:1025`) | `verifyAllowedRole` también deja pasar si `extra.admin === 'true'`. |
| A3 permisos como filas agrupadas en roles | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:570-579`; `models/core/src/security.ts:139-162`; `models/card/src/permissions.ts:60-187` | Rango del informe (140-166) algo corrido; Role está en 139-162 y Permission en 164-174. |
| A4 forbid gana sobre el positivo | CORREGIDO | `foundations/server/packages/middleware/src/spacePermissions.ts:167-199`; `models/process/src/permission.ts:21-76` | El forbid existe, pero no gana por regla: el primer permiso con `txMatch` que coincide decide (positivo o negativo) y entre los sin `txMatch` decide el último en el orden del conjunto (`:177-199`). Hay pares positivo y negativo con la misma coincidencia. Bash Logistics debe definir «denegar gana» de forma explícita. |
| A5 ámbito por contenedor con miembros | CONFIRMADO | `models/core/src/security.ts:60-90`; `foundations/server/packages/postgres/src/storage.ts:626-650` | EXISTS contra la tabla de espacios y filtro por `workspaceId`. |
| A6 archivado oculta sin borrar | CONFIRMADO | `foundations/server/packages/middleware/src/spaceSecurity.ts:539-545`; `foundations/server/packages/postgres/src/storage.ts:633-638` | `archivedCheck` en la consulta; el Owner puede verlos con `showArchived`. |
| A7 permiso por contenido de la operación | CONFIRMADO | `models/card/src/permissions.ts:19-49`; `spacePermissions.ts:185-193` | Ejemplo con `operations.$unset` y `txMatch`. |
| A8 permiso por campo no aplicado | CORREGIDO | `models/core/src/security.ts:176-180`; `plugins/setting-resources/src/components/EditAttribute.svelte:183-237`; `spacePermissions.ts:185-193` | La premisa es falsa: sí se aplica. La pantalla de atributos crea dos `AttributePermission` (permitir y prohibir) con `txMatch` sobre `operations.<campo>` y el evaluador genérico los hace cumplir, pero solo en escritura (nada de lectura ni enmascarado). La cita buena de la clase es `:176-180`, no `:152-155`. La idea de diseñar `permiso_campo` con lectura y escritura sigue siendo válida. |
| A9 historial derivado de transacciones | CONFIRMADO | `plugins/activity/src/index.ts:97-106`; `server-plugins/activity-resources/src/index.ts:233-283`, `:286-385`; `foundations/core/packages/core/src/tx.ts:94-100` | Un mensaje por cada conjunto de atributos cambiados, con `txId`. |
| A10 autor y fecha impuestos por el servidor | CONFIRMADO | `foundations/server/packages/middleware/src/identity.ts:49-75`; `foundations/server/packages/middleware/src/modified.ts:45-52` | La identidad rechaza (AccountMismatch) en vez de sobrescribir; las fechas sí se sobrescriben. Sistema y bot saltan el control. |
| A11 invitado edita solo lo que creó | CONFIRMADO | `foundations/server/packages/middleware/src/guestPermissions.ts:280-293`, `:313-317` | Solo update y remove, por `createdBy` en sus identidades. |
| A12 rol externo de solo lectura y de documento único | CORREGIDO | `foundations/core/packages/core/src/classes.ts:605-626`; `guestPermissions.ts:136-138`; `server/account/src/operations.ts:2148`, `:2265-2273`; `foundations/server/packages/postgres/src/storage.ts:629` | Solo lectura confirmado (ReadOnlyGuest y DocGuest no pueden escribir). «Documento único» no está respaldado: DocGuest es una marca del token y el filtro de lectura lo deja pasar sin restricción de espacio. Bash Logistics debe diseñar el acceso por documento por su cuenta. |
| A13 fallo cerrado para roles externos | CORREGIDO | `foundations/server/packages/middleware/src/guestPermissions.ts:295-320` (el `return true` de `:319`); `foundations/server/packages/middleware/src/tests/guestPermissions.test.ts:541-546` | La idea es cierta, pero la cita `:179-180` apunta a otra cosa (`processUserTx`); el defecto de denegar está en `:295-320`. |
| A14 matriz módulo por rol | CONFIRMADO | `foundations/core/packages/core/src/classes.ts:592-600`; `guestPermissions.ts:58-122` | En Huly la matriz solo rige para invitados y solo para crear (`:126-134` deja pasar a usuarios). Generalizarla a todos los roles es diseño propio. |
| A15 preferencias solo del dueño u Owner | CONFIRMADO | `foundations/server/packages/middleware/src/private.ts:42-48`, `:71-81` | Dominio `preference`; el Owner y el sistema son la excepción. |
| A16 tabla de miembros con rol | CONFIRMADO | `server/account/src/collections/postgres/postgres.ts:838-899` | Asignar, cambiar, quitar y leer rol; no hay historial de cambios (lo marca el informe). |

### Hechos de «Cómo lo resuelve»

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 1 (siete roles con peso) | CONFIRMADO | `classes.ts:605-626`; `utils.ts:801-803` | Coincide. |
| Hecho 3 (otorgar rol menor o igual al propio; asignables sin Admin ni invitados documentales) | CONFIRMADO | `server/account/src/utils.ts:167`, `:1849-1862`; `operations.ts:706`, `:722-723` | `assignableRoles` es Guest, User, Maintainer, Owner; también excluye ReadOnlyGuest. |
| Hecho 5 (filtro de lectura y umbral 85 %) | CONFIRMADO | `spaceSecurity.ts:528-545`, `:616-690` | El umbral solo aplica sin `limit`. El filtrado posterior ocurre en el servidor (`:683-690`, antes de responder), no en el navegador: el punto «no conviene copiar» sobre el 85 % exponiendo datos al cliente es un error del informe. |
| Hecho 7 (excepciones de lectura por rol) | CORREGIDO | `storage.ts:627-633`; `spaceSecurity.ts:539`, `:633` | Admin, DocGuest y ReadOnlyGuest coinciden, pero «DocGuest se limita a documentos concretos» no se sostiene: el código lo deja sin filtro de espacio (ver A12). |
| Hecho 9 (SpaceType, Role, asignación por mixin) | CORREGIDO | `models/core/src/security.ts:113-137`, `:139-162`, `:188-192`; `classes.ts:517-564` | La asignación de roles por espacio (mixin `SpacesTypeData`) está en `:188-192`, no en `:200-205`. |
| Hecho 11 (evaluación de permisos en escritura) | CONFIRMADO | `spacePermissions.ts:167-232`, `:420-452`, `:47-76`; `classes.ts:519` | Matiz de precedencia descrito en A4. |
| Hecho 14 (AttributePermission sin aplicación) | DESCARTADO | `plugins/setting-resources/src/components/EditAttribute.svelte:183-237`; `plugins/card-resources/src/components/settings/EditRole.svelte:189-198` | La búsqueda del informe omitió estos usos: el permiso se crea desde la interfaz con `txMatch` y lo evalúa el middleware genérico. Su sección «No conviene copiar» sobre «declarar sin aplicar» queda sin base. |
| Hecho 16 (TxAccessLevel, mixin heredado) | CORREGIDO | `models/core/src/security.ts:194-200`; `classes.ts:628-633`; `guestPermissions.ts:295-320`, `:341-364` | Citas desplazadas: el mixin está en `security.ts:194-200` (no 169-176) y su lectura en `guestPermissions.ts:341-364` (no 202-225). La matriz solo se consulta en creación (`:299-307`). |
| Hecho 19 (rol Usuario no edita contactos ajenos) | CORREGIDO | `guestPermissions.ts:126-134`, `:187-190`, `:192-225` | Cita `:48-51` errónea. Un Usuario solo queda bloqueado para fichas de otros empleados; sí puede editar las de personas no empleadas (clientes) y la propia. |
| Hecho 23 (orden de la cadena de seguridad) | CONFIRMADO | `server/server-pipeline/src/pipeline.ts:142-167` | Identidad, fecha, rango, filtro, privados, espacio, permisos de espacio, invitados, transacción, triggers. |

## platform-automatizacion

### Adoptable

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 aprobación genérica con acción serializada | CONFIRMADO | `models/request/src/index.ts:52-80`; `server-plugins/request-resources/src/index.ts:65-113` | Aplica `request.tx` al llegar al conteo y `rejectedTx` al rechazar; la tx es abierta, la lista cerrada es propuesta de Bash Logistics. |
| A2 aprobación por grupo todos o cualquiera | CONFIRMADO | `plugins/controlled-documents-resources/src/utils.ts:393-416`; `server-plugins/process-resources/src/index.ts:194-206`; `server-plugins/process-resources/src/functions.ts:595-615` | Huly decide entre n de n o 1 al crear; al rechazar borra las pendientes del grupo. |
| A3 máquina de estados declarativa | CONFIRMADO | `models/process/src/index.ts:140-162`; `services/process/src/main.ts:514-533`; `models/core/src/status.ts:61-71` | `TxApplyIf` con `currentState` esperado. |
| A4 categorías de estado fijas | CONFIRMADO | `models/core/src/status.ts:40-71`; `models/task/src/index.ts:380-443` | Cinco categorías reales. |
| A5 tabla de temporizadores | CONFIRMADO | `services/worker/src/db.ts:39-52`, `:58-67`, `:69-74`, `:76-102`; `services/worker/README.md:3-17`; `services/worker/src/worker.ts:67-84` | Confirmado que reenvía y borra después (`worker.ts:81-83`), lo que admite duplicados. |
| A6 esperar hasta con reprogramación | CONFIRMADO | `services/process/src/main.ts:610-722`; `server-plugins/process-resources/src/transform.ts:255-268` | `updateTimers` reprograma al cambiar la tarjeta, solo para valores de contexto. |
| A7 reglas campo cambia a X | CONFIRMADO | `server-plugins/process-resources/src/functions.ts:195-222`; `models/process/src/triggers.ts:111-125`; `plugins/process/src/index.ts:102-107`; `services/process/src/main.ts:396-403` | Tope de 100 encadenamientos comprobado. |
| A8 registro de ejecución y error que detiene | CONFIRMADO | `models/process/src/index.ts:164-180`; `services/process/src/main.ts:121-125`, `:551-553` | Con error no reacciona salvo `OnExecutionContinue`. |
| A9 numeración por serie con unicidad | CONFIRMADO | `plugins/tracker-resources/src/utils.ts:514-523`; `plugins/controlled-documents/src/docutils.ts:196-225`; `plugins/controlled-documents/src/utils.ts:97-99`; `models/controlled-documents/src/types.ts:309-319` | Matiz: lo citado de tracker es el camino de mover una incidencia, mismo mecanismo `$inc` que al crear. |
| A10 plantillas de aviso con marcadores | CONFIRMADO | `plugins/notification/src/index.ts:112-116`, `:132-157`, `:179-188`; `server-plugins/notification-resources/src/index.ts:180-244` | El enlace entra como HTML sin escapar (`:230`); asunto vacío no envía (`:237`). |
| A11 plantillas con campos `${...}` | CONFIRMADO | `plugins/templates/src/index.ts:60-74`; `plugins/templates-resources/src/utils.ts:32-46`; `models/templates/src/index.ts:60-65` | Solo sustituye ids registrados. |
| A12 PDF desde el mismo HTML | CONFIRMADO | `services/print/pod-print/src/print.ts:28-113`; `services/print/pod-print/src/server.ts:202-241`, `:305-346` | El «enlace de un solo uso» es propuesta propia; Huly usa un enlace público. |
| A13 vistas guardadas compartibles | CONFIRMADO | `plugins/view/src/types.ts:110-121`, `:455-467`, `:738-741` | FilteredView con `sharable` y `users`. |
| A14 tipos de ausencia con factor | CONFIRMADO | `models/hr/src/index.ts:116-125`, `:179-186`, `:227-285` | Factores -1, -0,5 y +1; festivos por departamento. |
| A15 documento controlado con versión vigente única | CONFIRMADO | `server-plugins/controlled-documents-resources/src/index.ts:62-82`, `:267-288`; `plugins/controlled-documents/src/types.ts:193-199` | Archiva las vigentes anteriores al volverse efectivo. |
| A16 bloqueo de edición en aprobación | CONFIRMADO | `server-plugins/process-resources/src/functions.ts:617-634`; `models/process/src/actions.ts:151-175` | Pone `readonly` y guarda el inverso; que RLS lo haga cumplir es diseño propio. |

### Hechos de «Cómo lo resuelve»

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| Hecho 1 (Process atado a masterTag) | CONFIRMADO | `models/process/src/index.ts:89-119`; `plugins/process/src/index.ts:41-52`, `:163-167` | Coincide. |
| Hecho 2 (Transition con rank) | CONFIRMADO | `models/process/src/index.ts:140-162`; `services/process/src/main.ts:207-216` | Orden ascendente por rank. |
| Hecho 5 (cola, deduplicación, pickTransition) | CONFIRMADO | `services/process/src/main.ts:70-88`, `:145-217`, `:841-858` | El mapa de ids es en memoria y con tope de 1000. |
| Hecho 7 (aplicación atómica con control optimista) | CONFIRMADO | `services/process/src/main.ts:352-380`, `:396-403`, `:514-533` | Coincide. |
| Hecho 11 (pila de reversión de 30) | CONFIRMADO | `services/process/src/main.ts:324-337`, `:406-412`, `:487-503` | Corte a 30 en `:503`. |
| Hecho 13 (temporizadores en `time_machine.delayed_events`) | CONFIRMADO | `services/worker/README.md:3-17`, `:39-45`; `services/worker/src/db.ts:39-90`; `services/process/src/main.ts:610-722` | Sondeo cada 5 s por defecto; cancelación con `ILIKE`. |
| Hecho 16 (documentos controlados y publicación por fecha) | CORREGIDO | `plugins/controlled-documents/src/types.ts:193-199`, `:206-243`; `plugins/controlled-documents-resources/src/utils.ts:384-423`; `server-plugins/controlled-documents-resources/src/index.ts:267-288`, `:342-390` | Estados, `notMatch` y archivado coinciden. «Con fecha planificada solo se publica al llegar la fecha» no está en lo citado: `:342-390` solo vuelve vigente de inmediato cuando `plannedEffectiveDate` es 0; no se halló quien publica al vencer la fecha. |
| Hecho 17 (numeración por plantilla con reintento) | CONFIRMADO | `plugins/controlled-documents/src/docutils.ts:57-135`, `:137-158`, `:160-194`, `:196-240`; `plugins/controlled-documents/src/utils.ts:97-99` | Dos `notMatch` y reintento con máximo real. |
| Hecho 19 (plantillas de mensaje) | CONFIRMADO | `plugins/templates-resources/src/utils.ts:14-55`; `plugins/templates/src/index.ts:74` | Regex `\$\{(\S+?)}`. |
| Hecho 21 (PDF con Chromium) | CONFIRMADO | `services/print/pod-print/src/print.ts:28-113`; `services/print/pod-print/src/server.ts:202-241`, `:305-346`; `models/print/src/index.ts:17-30` | Márgenes 1,5 cm arriba y abajo, 1 cm a los lados. |

## Notas para quien consolide

1. El informe de permisos debe corregir tres puntos que arrastran decisiones: Huly sí aplica un permiso por campo (solo escritura), el forbid no tiene precedencia fija, y DocGuest no está limitado a un documento por el código citado.
2. El informe de permisos dice que el filtro del 85 % expone datos al navegador; el filtrado se hace en el servidor antes de responder, así que ese ítem de «No conviene copiar» no se sostiene.
3. El informe de CRM cuenta cuatro categorías de etapa; hay cinco.
4. No se ejecutó nada; todo es lectura estática de las citas.
