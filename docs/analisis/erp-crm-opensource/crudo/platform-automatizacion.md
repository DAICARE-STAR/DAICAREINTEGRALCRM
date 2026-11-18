# platform — automatizacion

Repo: Huly Platform (hcengineering/platform), licencia EPL-2.0. Solo se estudian ideas y patrones; no se copia código. Todas las rutas son relativas a la raíz del repo `platform`.

Contexto de lectura: Huly guarda todo como transacciones sobre un modelo de objetos (clases, mixins, Cards con "tags" que hacen de tipos personalizados). Su motor de procesos (`process`) es el equivalente a un flujo de estados con disparadores y acciones. No es un ERP: no hay facturación, cartera ni contabilidad en el repo, así que lo útil está en la mecánica de flujos, temporizadores, numeración, plantillas y PDF.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

1. **Un proceso es una máquina de estados atada a un tipo de objeto.** `Process` declara `masterTag` (el tipo de Card al que aplica), `initState`, `autoStart`, `parallelExecutionForbidden`, `automationOnly` y `requiredSlots`. Los estados son documentos `State` con título y rank. Cita: `models/process/src/index.ts:89-119` y `models/process/src/index.ts:260-272`; interfaz en `plugins/process/src/index.ts:41-52`.

2. **Cada arista es una `Transition` con disparador, parámetros y lista de acciones.** Una transición tiene `from` (puede ser null para el arranque), `to`, `trigger`, `triggerParams`, `actions: Step[]` y `rank` (el rank fija la prioridad cuando varias transiciones coinciden). Cita: `models/process/src/index.ts:140-162`; `plugins/process/src/index.ts:78-86`; el orden por rank se usa en `services/process/src/main.ts:207-216`.

3. **Los disparadores son un catálogo cerrado de documentos `Trigger`, con función de verificación opcional.** Catálogo: aprobación aprobada, aprobación rechazada, tarea cerrada, tarea cancelada, inicio de ejecución, "cuando la tarjeta cumple una condición", "cuando cambia un campo", "cuando los campos requeridos están completos", subprocesos terminados, subproceso con cierto estado y "esperar hasta una fecha". Cada uno trae `requiredParams`, `checkFunction`, `init` (sirve para arrancar) y `auto` (se reevalúa solo tras cada transición). Cita: `models/process/src/triggers.ts:18-204`; interfaz `plugins/process/src/index.ts:67-76`.

4. **La condición se evalúa del lado servidor con el mismo lenguaje de consulta que el resto del sistema.** `MatchCardCheck` y `FieldChangedCheck` toman los parámetros como una consulta (`matchQuery`) sobre la tarjeta y confirman que haya coincidencia; `FieldChangedCheck` además exige que la operación de la transacción realmente toque ese campo. `RequiredFieldsFilledCheck` recorre los atributos marcados `required` del tipo y comprueba que no estén vacíos. Cita: `server-plugins/process-resources/src/functions.ts:144-172`, `:195-222`, `:230-252`.

5. **Un servicio aparte consume eventos de una cola y decide qué transición disparar.** Cada evento trae `event[]` (varios triggers posibles), `execution` o `card`, `context` y un `_id` único. El manejador descarta duplicados con un mapa de ids ya procesados, busca las transiciones cuyo `from` es el estado actual y cuyo trigger coincide, y toma la primera cuya función de verificación devuelva verdadero (por rank). Cita: `services/process/src/main.ts:74-119` (deduplicación), `:145-177`, `:179-217`, `:841-858` (`pickTransition`).

6. **Los eventos se generan con disparadores de servidor sobre las transacciones del modelo.** Al cerrar una tarea, crear/actualizar/borrar una tarjeta, crear una ejecución o crear un evento personalizado, el servidor publica un mensaje a la cola `Process`. Cita: `server-plugins/process-resources/src/index.ts:162-209` (cierre de tarea, con el caso especial de aprobación), `:237-255` (inicio), `:610-649` (actualización de tarjeta publica tres triggers a la vez).

7. **La transición se aplica de forma atómica y con control optimista.** Todas las transacciones de las acciones más el cambio de estado más el registro de log se empaquetan en un `TxApplyIf` que solo se aplica si la ejecución sigue en el `currentState` esperado; si no, se registra como "ya procesada" y se aborta. Hay un guardia en memoria (`activeExecutions`) contra reentradas, una relectura previa para detectar transiciones obsoletas y un tope de 100 encadenamientos automáticos para evitar bucles. Cita: `services/process/src/main.ts:352-380`, `:396-403`, `:514-533`.

8. **Cada acción es un `Method` con editor de parámetros y un resultado que alimenta el contexto de la ejecución.** Métodos disponibles: ejecutar subproceso, pedir aprobación, crear tarea, actualizar tarjeta, crear tarjeta, añadir relación, añadir etiqueta, cancelar tarea, cancelar subproceso, bloquear/desbloquear tarjeta, sección o campo. `createdContext` declara qué objeto produce la acción para que pasos posteriores lo referencien. Cita: `models/process/src/actions.ts:19-229`; `Step` y `StepContext` en `plugins/process/src/index.ts:171-182`.

9. **Los parámetros de una acción se resuelven con un pequeño DSL de contexto.** `${@campo}`, `${@ref.campo}`, `$relation(...)`, `$context(id,clave)`, constantes `#valor,clave`, y modificadores encadenados `=>FUNCION(...)` y `=>FALLBACK(valor)`. Las funciones son de cuatro tipos (`transform`, `reduce`, `context`, `convert`): sumar, redondear, desplazar fechas, diferencia de fechas, mayúsculas, etc., más contextos como "usuario actual", "iniciador de la ejecución" y "usuarios del rol X del espacio". Cita: `plugins/process/docs/dsl.md:10-57`; `plugins/process/src/types.ts:40-99`; `models/process/src/index.ts:298-320`; implementaciones en `server-plugins/process-resources/src/transform.ts:243-290` y `:487-529`; resolución en `services/process/src/main.ts:760-778`.

10. **La aprobación es una tarea (`ApproveRequest`) por aprobador, agrupada por `group`.** `RequestApproval` crea una tarea por usuario con el mismo `group`; el trigger "aprobada" solo se cumple si todas las del grupo tienen `approved === true`, y "rechazada" si alguna tiene `false`. Cuando una se rechaza, el servidor borra las demás pendientes del grupo. Si el campo origen de los aprobadores cambia en la tarjeta, reasigna las tareas pendientes (quita los que salieron, crea para los nuevos). Cita: `server-plugins/process-resources/src/functions.ts:536-615`; `server-plugins/process-resources/src/index.ts:174-206` y `:439-526`; modelo `models/process/src/index.ts:224-239`.

11. **Deshacer: cada transición guarda su inverso en una pila.** Cada acción devuelve las transacciones de rollback; se apilan por transición (máximo 30) y un evento "rollback" o el borrado de una tarea con `withRollback` las ejecuta en orden inverso. Un trigger puede aportar su propio inverso o prohibir el rollback (`preventRollback`). Cita: `services/process/src/main.ts:324-350`, `:406-412`, `:487-503`; `server-plugins/process-resources/src/rollback.ts:21-48`; `models/server-process/src/index.ts:43-47` y `:63-65`.

12. **Auditoría y error por ejecución.** Cada arranque o transición crea un `ExecutionLog` (dominio separado `process-log`). Si una acción falla, la ejecución queda con `error[]` y no avanza hasta que llegue `OnExecutionContinue` (reintento manual); mientras tiene error no reacciona a otros eventos. Cita: `models/process/src/index.ts:164-209`; `services/process/src/main.ts:121-125`, `:505-513`, `:551-553`; reintento en `server-plugins/process-resources/src/index.ts:281-307`.

13. **Temporizadores como servicio genérico con una sola tabla en Postgres.** El trigger "esperar hasta" calcula la fecha objetivo desde el contexto (por ejemplo "5 días después de la fecha de vencimiento de la tarjeta"), publica un mensaje `schedule` con id `execution_transition`, y un servicio hace polling cada 5 s de `time_machine.delayed_events` (id, workspace, target_date, topic, data jsonb; clave primaria id+workspace) y reenvía el payload al vencer. Cancelar usa `ILIKE 'prefijo_%'`. Si cambia el campo del que depende la fecha, se reprograma. Cita: `services/worker/README.md:3-17` y `:33-40`; `services/worker/src/db.ts:39-52`, `:58-67`, `:69-74`, `:76-90`; `services/process/src/main.ts:610-722`; verificación en `server-plugins/process-resources/src/functions.ts:254-257`.

14. **Procesos anidados.** `RunSubProcess` crea una `Execution` hija (`parentId`) sobre la misma tarjeta u otra; al cambiar el estado de un hijo, el padre revisa los triggers "subprocesos terminados" y "subproceso con estado X" (con cuantificadores `$all`, `$in`, `$nin`). Cita: `server-plugins/process-resources/src/functions.ts:481-534`, `:99-142`; `services/process/src/main.ts:780-811`.

15. **Aprobación genérica fuera del motor: `Request` guarda la transacción que se aplicará al aprobar.** Una solicitud adjunta a cualquier documento lleva `requested[]`, `approved[]`, `requiredApprovesCount`, `status` (Active, Completed, Rejected, Cancelled), `tx` (la transacción de aprobado) y `rejectedTx`. Un disparador de servidor, al llegar a la cantidad requerida, marca Completed y aplica `request.tx`; al rechazar aplica `rejectedTx`. Cita: `models/request/src/index.ts:52-80`; `plugins/request/src/index.ts:26-51`; `server-plugins/request-resources/src/index.ts:65-113`.

16. **Documentos controlados: ciclo con estado de documento más estado de flujo y aprobación secuencial.** `DocumentState` (Draft, Effective, Archived, Deleted, Obsolete) convive con `ControlledDocumentState` (InReview, Reviewed, InApproval, Approved, Rejected, ToReview). Se crea una solicitud de revisión y una de aprobación; una operación `notMatch` impide dos solicitudes activas a la vez sobre el mismo documento. Al volverse vigente, un disparador archiva las versiones vigentes anteriores y actualiza la metadata; con fecha efectiva planificada, solo se publica al llegar la fecha. Cita: `plugins/controlled-documents/src/types.ts:193-199`, `:206-243`; `plugins/controlled-documents-resources/src/utils.ts:384-423`; `server-plugins/controlled-documents-resources/src/index.ts:62-82`, `:267-288`, `:313-340`, `:342-390`; `plugins/controlled-documents/src/utils.ts:759-769`.

17. **Numeración de documentos: contador por plantilla, con reintento.** La plantilla (mixin `DocumentTemplate`) tiene `docPrefix` y `sequence`. El código es `prefijo-número`. Para crear un documento se incrementa `sequence` en la plantilla y se crea la metadata dentro de una operación `apply` con dos `notMatch` (misma plantilla+número, mismo código); si choca, se reintenta calculando el máximo real de los documentos existentes. Cita: `models/controlled-documents/src/types.ts:309-319`; `plugins/controlled-documents/src/docutils.ts:57-135`, `:137-158`, `:160-194`, `:196-240`; formato en `plugins/controlled-documents/src/utils.ts:97-99`.

18. **Numeración de incidencias: contador en el proyecto con incremento atómico.** El proyecto guarda `identifier` (prefijo) y `sequence`; para numerar se hace `$inc: { sequence: 1 }` pidiendo el objeto resultante y se arma `identifier-número`. Cita: `models/tracker/src/types.ts:126-133`; `plugins/tracker-resources/src/utils.ts:514-534` y `:559-583`.

19. **Plantillas de mensaje con campos `${...}` resueltos por funciones registradas.** `MessageTemplate` (título + markup) vive en categorías (espacios). Los campos son documentos `TemplateField` con una función y una categoría; el motor busca `${id}` con una expresión regular y reemplaza llamando la función con un proveedor de datos del contexto. Cita: `models/templates/src/index.ts:39-65`; `plugins/templates/src/index.ts:29-33`, `:60-74`; `plugins/templates-resources/src/utils.ts:14-55`.

20. **Plantillas de notificación por correo: texto, HTML y asunto, con marcadores `{sender}`, `{doc}`, `{link}`.** Cada tipo de notificación declara `templates` (textTemplate, htmlTemplate, subjectTemplate), grupo, si está activado por defecto, y matchers. El servidor sustituye marcadores; si el asunto resulta vacío, no envía. El usuario activa o desactiva por tipo y por proveedor (`NotificationTypeSetting`, `NotificationProviderSetting`). Cita: `plugins/notification/src/index.ts:112-116`, `:132-157`, `:159-188`; `server-plugins/notification-resources/src/index.ts:180-244`; ejemplo en `models/tracker/src/index.ts:156-160`.

21. **PDF: un servicio abre una URL en Chromium sin interfaz y la imprime.** `print()` lanza Puppeteer, navega, espera red inactiva, emula medios `print`, hace scroll para forzar el renderizado diferido, lee `#page-header` y `#page-footer` del DOM como cabecera y pie, y emite A4 con márgenes de 1.5 cm y 1 cm. El endpoint `/print/:clase/:id` busca el objeto, genera un enlace público y lo imprime; `/print?link=` valida protocolo y lista blanca de hosts. Cita: `services/print/pod-print/src/print.ts:28-113`; `services/print/pod-print/src/server.ts:202-241`, `:305-346`; acción de menú "Imprimir a PDF" en `models/print/src/index.ts:17-30`.

22. **Vistas guardadas y configuración declarativa de listas.** `Viewlet` define clase, consulta base, columnas, opciones y descriptor (lista, tablero); `ViewletPreference` guarda las columnas por usuario; `FilteredView` guarda filtros con nombre, ubicación, `sharable` y usuarios con quienes se comparte. Cita: `plugins/view/src/types.ts:455-467`, `:738-741`, `:110-121`.

23. **Ausencias de RR. HH. como solicitudes con tipo parametrizado.** `RequestType` lleva `value` (suma o resta de días: vacaciones -1, enfermedad -1, medio día -0.5, horas extra +1) y color; `Request` guarda empleado, departamento, tipo, fecha inicio y fin con zona horaria; hay festivos por departamento (`PublicHoliday`). Cita: `models/hr/src/index.ts:116-125`, `:143-186`, `:227-282`.

24. **Permisos sobre transacciones, incluyendo permisos "prohibir".** Un `Permission` se define por clase de transacción, clase de objeto y un `txMatch` (por ejemplo, solo la actualización que pone `status = cancelled`), con `forbid: true` para negativos. Se usa para "ejecutar proceso" y "cancelar proceso". Cita: `models/process/src/permission.ts:21-76`; ejemplos generales en `models/core/src/permissions.ts:20-65`.

25. **Categorías de estado reutilizables (sin iniciar, por hacer, activo, ganado, perdido).** Los estados de cualquier flujo apuntan a una `StatusCategory`; el tablero y los informes se apoyan en la categoría, no en el nombre del estado. Cita: `models/core/src/status.ts:40-71`; `models/task/src/index.ts:386-442`; los tipos de tarea y proyecto con sus estados permitidos en `models/task/src/index.ts:175-228`.

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| Process | name, description, masterTag, initState, autoStart, automationOnly, parallelExecutionForbidden, requiredSlots, bindings, context | masterTag apunta al tipo de Card; tiene States y Transitions | `models/process/src/index.ts:89-119` |
| State | title, rank, process | pertenece a Process | `models/process/src/index.ts:260-272` |
| Transition | from (nullable), to, trigger, triggerParams, actions[], rank | process, from y to apuntan a State; trigger apunta a Trigger | `models/process/src/index.ts:140-162` |
| Trigger | label, requiredParams, checkFunction, init, auto, editor | catálogo en el modelo (no por cliente) | `models/process/src/triggers.ts:18-204`; `plugins/process/src/index.ts:67-76` |
| Method | label, objectClass, requiredParams, createdContext, defaultParams | catálogo de acciones; la implementación se enlaza con un mixin de servidor | `models/process/src/actions.ts:19-229`; `models/server-process/src/index.ts:33-51` |
| Step (embebido en Transition) | _id, methodId, params, context, results | referencia a Method | `plugins/process/src/index.ts:171-177` |
| Execution | process, currentState, card, status (active, done, cancelled), context, rollback[][], error[], parentId, result | card; parentId apunta a otra Execution | `models/process/src/index.ts:182-209`; `plugins/process/src/index.ts:109-127` |
| ExecutionLog | execution, process, card, transition, action (started, transition, rollback) | dominio `process-log` | `models/process/src/index.ts:164-180` |
| ProcessToDo / ApproveRequest | execution, withRollback, askRequired; approved, reason, group, actionType (approve, review), field | hereda de ToDo de `time`; adjunta a la tarjeta | `models/process/src/index.ts:211-239` |
| ProcessCustomEvent / EventButton | eventType, execution, card | botón en la tarjeta que lanza un evento | `models/process/src/index.ts:274-296` |
| ProcessFunction | type (transform, reduce, context, convert), of, to, allowMany | catálogo de funciones del DSL | `models/process/src/index.ts:298-320` |
| Request (aprobación genérica) | requested[], approved[], approvedDates[], requiredApprovesCount, status, tx, rejectedTx | adjunta a cualquier documento | `models/request/src/index.ts:52-80` |
| DocumentTemplate (mixin) | docPrefix, sequence | documentos hijos con template, seqNumber, prefix | `models/controlled-documents/src/types.ts:309-319`; `plugins/controlled-documents/src/docutils.ts:57-135` |
| ControlledDocument | state, controlledState, reviewers[], approvers[], reviewInterval, plannedEffectiveDate, effectiveDate, changeControl | requests (colección), changeControl | `plugins/controlled-documents/src/types.ts:206-217` |
| ChangeControl | description, reason, impact, impactedDocuments[] | documentos afectados | `plugins/controlled-documents/src/types.ts:224-229` |
| Project (tracker) | identifier, sequence, defaultIssueStatus | issues numerados con identifier-número | `models/tracker/src/types.ts:126-133` |
| MessageTemplate / TemplateField | title, message (markup); category, func | categorías como espacios | `models/templates/src/index.ts:39-65` |
| NotificationType | group, defaultEnabled, templates{text, html, subject}, txClasses, objectClass, txMatch, onlyOwn | NotificationProvider, NotificationTypeSetting por usuario | `plugins/notification/src/index.ts:112-188` |
| Viewlet / FilteredView | attachTo, baseQuery, config, descriptor; name, filters, sharable, users | por clase; por usuario | `plugins/view/src/types.ts:110-121`, `:455-467` |
| RequestType / Request (HR) | label, value, color; attachedTo, department, type, tzDate, tzDueDate | Staff, Department | `models/hr/src/index.ts:116-177` |
| delayed_events (Postgres) | id, workspace, target_date, topic, data jsonb | PK (id, workspace); índice por target_date | `services/worker/src/db.ts:39-52` |

## Decisiones de diseño que se notan y su porqué

1. **Disparadores, acciones y funciones son catálogos en el modelo, no código suelto.** Cada uno es un documento con editor y presentador. Porqué: la interfaz de configuración se arma sola y un módulo nuevo solo registra sus propios disparadores y acciones. Cita: `models/process/src/triggers.ts:18-204`, `models/process/src/actions.ts:19-229`.
2. **El proceso se ata a un tipo de objeto y la ejecución a un objeto concreto.** No hay "flujos globales"; todo flujo vive sobre un `masterTag`. Porqué: las condiciones y los campos se resuelven contra un esquema conocido. Cita: `models/process/src/index.ts:97-98`, `:194-196`.
3. **Todo pasa por una cola y por un servicio aparte, con entrega "al menos una vez".** Por eso hay deduplicación por id, control optimista de estado y relectura previa. Porqué: el servidor de transacciones no se bloquea por flujos lentos y los reintentos son seguros. Cita: `services/process/src/main.ts:74-88`, `:352-366`, `:516-531`.
4. **Deshacer como dato.** Se guarda la transacción inversa junto a cada transición en lugar de recalcularla. Porqué: revertir un paso es reproducible aunque el modelo haya cambiado. Cita: `services/process/src/main.ts:406-412`, `:487-503`.
5. **Un error detiene la ejecución y exige reintento humano.** No hay reintento automático infinito. Porqué: evita acciones duplicadas con efectos externos (correos, tareas). Cita: `services/process/src/main.ts:121-125`, `:551-553`.
6. **Los temporizadores son un servicio genérico y reprogramable por id.** Porqué: la misma tabla sirve para recordatorios de calendario y para esperas de flujo, y se cancelan por prefijo. Cita: `services/worker/README.md:3-17`; el uso desde calendario aparece en `server-plugins/calendar-resources/src/index.ts` (solo localizado por nombre, no leído a fondo).
7. **La aprobación genérica guarda "lo que pasará al aprobar" como una transacción serializada.** Porqué: cualquier módulo puede pedir aprobación sin escribir su propio flujo. Cita: `models/request/src/index.ts:71-72`; `server-plugins/request-resources/src/index.ts:71-106`.
8. **Numeración con contador y verificación de unicidad en el mismo paso.** Dos mecanismos: `$inc` atómico en el proyecto y `notMatch` más reintento en documentos. Porqué: dos usuarios creando a la vez no deben repetir número. Cita: `plugins/tracker-resources/src/utils.ts:514-523`; `plugins/controlled-documents/src/docutils.ts:196-215`.
9. **El PDF se hace con el mismo HTML que ve el usuario, no con una plantilla aparte.** Porqué: un solo diseño que mantener; la cabecera y el pie salen de elementos con id fijo en esa página. Cita: `services/print/pod-print/src/print.ts:75-103`.
10. **Un objeto "bloqueado" por el flujo.** `LockCard`, `LockSection` y `LockField` marcan la tarjeta como solo lectura y se revierten con rollback. Porqué: un documento en revisión no debe editarse. Cita: `server-plugins/process-resources/src/functions.ts:617-634`.

## Adoptable para Bash Logistics (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Aprobación genérica con "acción al aprobar" y "acción al rechazar" serializadas.**
- Idea: una tabla `solicitudes_aprobacion` (documento_tipo, documento_id, aprobadores[], aprobaron[], requeridos, estado, accion_aprobada jsonb, accion_rechazada jsonb). Un trigger de Postgres o una función aplica la acción cuando se alcanza la cantidad requerida.
- Cita: `models/request/src/index.ts:52-80`; `server-plugins/request-resources/src/index.ts:65-113`.
- Por qué: compras, descuentos, notas crédito y pagos necesitan un visto bueno; con un solo mecanismo se reutiliza en todos los módulos.
- Esfuerzo: medio. La acción serializada debe ser una lista cerrada de operaciones permitidas (por ejemplo "cambiar estado a X"), no SQL libre.

**A2. Aprobación por grupo con regla "todos" o "cualquiera" y cancelación de pendientes al rechazar.**
- Idea: campo `requeridos` (n de m) y, al primer rechazo, cancelar las solicitudes abiertas del grupo.
- Cita: `plugins/controlled-documents-resources/src/utils.ts:409-416`; `server-plugins/process-resources/src/index.ts:194-206`; `server-plugins/process-resources/src/functions.ts:595-615`.
- Por qué: una pyme típica tiene dos casos reales: "el gerente o el contador" y "ambos socios".
- Esfuerzo: bajo (sobre A1).

**A3. Máquina de estados declarativa por entidad (estados, transiciones, quién puede ejecutarlas), sin motor de flujos completo.**
- Idea: tablas `flujo_estado` y `flujo_transicion` (desde, hacia, permiso requerido, acciones fijas). Una función `aplicar_transicion` valida el estado de origen y escribe un registro de historial en una sola transacción, con control optimista (`WHERE estado = $esperado`).
- Cita: `models/process/src/index.ts:140-162`; `services/process/src/main.ts:514-533`; categorías de estado en `models/core/src/status.ts:61-71`.
- Por qué: pedidos, cotizaciones, órdenes de compra y facturas tienen ciclo de vida; hoy sería código disperso en cada módulo.
- Esfuerzo: medio. Recomiendo omitir el DSL y los disparadores configurables en la primera versión.

**A4. Categorías de estado fijas (borrador, activo, ganado/cerrado, perdido/anulado) separadas del nombre del estado.**
- Idea: cada estado configurable por el cliente pertenece a una categoría del sistema; informes y tableros agrupan por categoría.
- Cita: `models/core/src/status.ts:40-71`; `models/task/src/index.ts:386-442`.
- Por qué: cada instalación renombra sus estados, pero el embudo del CRM y los informes de cartera necesitan una noción estable de "cerrado ganado".
- Esfuerzo: bajo.

**A5. Tabla de temporizadores en Postgres con id compuesto, upsert y cancelación por prefijo.**
- Idea: `eventos_programados(id, instalacion, fecha_objetivo bigint, tema, datos jsonb)`, PK (id), índice por fecha; una Netlify Function programada o `pg_cron` vacía las vencidas cada minuto y llama a un manejador. Reprogramar es `ON CONFLICT DO UPDATE`.
- Cita: `services/worker/src/db.ts:39-52`, `:58-67`, `:69-74`, `:76-102`; `services/worker/README.md:3-17`.
- Por qué: recordatorios de cartera vencida, seguimiento de cotizaciones, renovaciones; una sola tabla evita un cron por cada función.
- Esfuerzo: bajo-medio. Hay que garantizar ejecución única (tomar y borrar las filas en la misma transacción con `FOR UPDATE SKIP LOCKED`; el original lee, reenvía y recién borra después, lo que admite duplicados).

**A6. Disparador "esperar hasta" calculado desde un campo con reprogramación automática.**
- Idea: regla "N días después de la fecha de vencimiento"; al cambiar la fecha en el documento se recalcula el temporizador.
- Cita: `services/process/src/main.ts:610-722`; `server-plugins/process-resources/src/transform.ts:255-268`.
- Por qué: es el caso de uso principal de automatización en una pyme (cobros, vencimientos de contrato, cotizaciones sin respuesta).
- Esfuerzo: medio (sobre A5).

**A7. Reglas simples "cuando un campo cambia a X, hacer Y" como datos, con verificación contra la fila nueva.**
- Idea: tabla `reglas(entidad, campo, condicion jsonb, accion jsonb)`, evaluada en un trigger tras el UPDATE; acciones permitidas limitadas: asignar, notificar, cambiar estado, crear actividad.
- Cita: `server-plugins/process-resources/src/functions.ts:195-222`; `models/process/src/triggers.ts:111-125`; `plugins/process/src/index.ts:102-107`.
- Por qué: el cliente quiere "cuando una cuenta pasa a cliente, crear tarea de bienvenida" sin pedirle código a quien instala.
- Esfuerzo: medio. Cuidar bucles: copiar el tope de encadenamiento (`services/process/src/main.ts:396-403`).

**A8. Registro de ejecución de cada regla y estado "con error" que detiene hasta reintento.**
- Idea: `ejecuciones_log(ejecucion, transicion, accion, momento)` y `error jsonb` en la ejecución; no reintentar solo.
- Cita: `models/process/src/index.ts:164-180`; `services/process/src/main.ts:121-125`, `:551-553`.
- Por qué: las automatizaciones que fallan en silencio son la mayor fuente de desconfianza; el historial responde "por qué pasó esto".
- Esfuerzo: bajo.

**A9. Numeración con contador por serie y control de unicidad, con prefijo configurable.**
- Idea: tabla `series_numeracion(entidad, prefijo, siguiente)`; obtener el número con `UPDATE ... SET siguiente = siguiente + 1 RETURNING` en la misma transacción que crea el documento, más restricción UNIQUE (prefijo, número). Formato `prefijo-número`.
- Cita: `plugins/tracker-resources/src/utils.ts:514-523` (incremento atómico que devuelve el nuevo valor); `plugins/controlled-documents/src/docutils.ts:196-215` (unicidad); `plugins/controlled-documents/src/utils.ts:97-99`; `models/controlled-documents/src/types.ts:309-319`.
- Por qué: cotizaciones, pedidos, facturas y recibos. En Postgres es más simple y seguro que lo que hace Huly (no necesita el reintento con máximo real, que existe porque su contador no es transaccional).
- Esfuerzo: bajo. Nota: para facturación electrónica colombiana la numeración es por resolución DIAN con rango autorizado; hay que añadir rango y vigencia (no está en Huly).

**A10. Plantillas de correo con asunto, texto y HTML, y marcadores `{campo}` por tipo de aviso.**
- Idea: tabla `plantillas_aviso(tipo, asunto, texto, html)` con marcadores sustituidos en el servidor; no se envía si el asunto queda vacío; el usuario activa o desactiva por tipo y canal.
- Cita: `plugins/notification/src/index.ts:112-116`, `:132-157`, `:179-188`; `server-plugins/notification-resources/src/index.ts:180-244`.
- Por qué: Bash Logistics ya tiene avisos; las plantillas editables por instalación permiten adaptar el tono sin tocar código.
- Esfuerzo: bajo. Escapar HTML en los valores sustituidos (Huly inserta el enlace como HTML directo, `server-plugins/notification-resources/src/index.ts:230`).

**A11. Plantillas de mensaje con campos tipo `${cliente.nombre}` resueltos por funciones registradas.**
- Idea: catálogo de campos disponibles por entidad (nombre, saldo, fecha), insertables desde un selector; el sustituyente solo acepta ids del catálogo.
- Cita: `plugins/templates/src/index.ts:60-74`; `plugins/templates-resources/src/utils.ts:32-46`; `models/templates/src/index.ts:60-65`.
- Por qué: WhatsApp y correo de cobro o seguimiento con datos del cliente, sin que el usuario escriba expresiones.
- Esfuerzo: bajo.

**A12. PDF desde el mismo HTML con cabecera y pie leídos de elementos con id fijo.**
- Idea: una Netlify Function (o un contenedor aparte, porque Chromium pesa) que abre una vista de impresión autenticada con un enlace de un solo uso y emite A4 con márgenes; cabecera y pie salen de `#page-header` y `#page-footer`.
- Cita: `services/print/pod-print/src/print.ts:28-113`; `services/print/pod-print/src/server.ts:202-241`, `:305-346`.
- Por qué: cotizaciones, facturas y estados de cuenta con el mismo aspecto que en pantalla.
- Esfuerzo: medio-alto en Netlify (Chromium sin interfaz excede los límites típicos de una función; puede requerir una capa o un servicio externo). Alternativa: CSS de impresión del navegador y "Guardar como PDF" en la primera versión.

**A13. Vistas guardadas por usuario y compartibles (filtros con nombre).**
- Idea: tabla `vistas_guardadas(entidad, nombre, filtros jsonb, compartida, usuarios[], creada_por)` con RLS por dueño o lista; columnas por usuario en otra tabla.
- Cita: `plugins/view/src/types.ts:110-121`, `:738-741`, `:455-467`.
- Por qué: "mis cuentas por cobrar vencidas" y "cotizaciones de la semana" son informes diarios de una pyme y no requieren un constructor de informes.
- Esfuerzo: bajo-medio.

**A14. Tipos de ausencia con factor numérico (suma o resta de días) y festivos por departamento.**
- Idea: `tipos_ausencia(nombre, factor, color)` con factor -1, -0.5, +1; calendario de festivos configurable.
- Cita: `models/hr/src/index.ts:116-125`, `:227-282`, `:179-186`.
- Por qué: base para saldo de vacaciones y horas extra en RR. HH. con muy poco modelo; en Colombia los festivos (ley Emiliani) deben ser un dato editable.
- Esfuerzo: bajo.

**A15. Documento controlado con versión vigente única y archivado automático de la anterior.**
- Idea: para contratos, políticas, listas de precios y plantillas de documento: estados borrador, en revisión, vigente, archivado; al publicar una versión se archiva la vigente.
- Cita: `server-plugins/controlled-documents-resources/src/index.ts:67-82`, `:267-288`; `plugins/controlled-documents/src/types.ts:193-199`.
- Por qué: precios y condiciones comerciales con historial claro y sin dos versiones vigentes.
- Esfuerzo: medio.

**A16. Bloqueo de edición mientras el documento está en aprobación.**
- Idea: columna `bloqueado` que el flujo activa al pedir aprobación y libera al terminar; RLS o trigger impide UPDATE sobre filas bloqueadas salvo desbloqueo.
- Cita: `server-plugins/process-resources/src/functions.ts:617-634`; `models/process/src/actions.ts:151-175`.
- Por qué: evita que una cotización cambie después de que el gerente la aprobó.
- Esfuerzo: bajo.

## No conviene copiar (y por qué)

1. **El DSL de contexto completo y el editor de procesos con funciones encadenadas.** Es un lenguaje propio con su analizador y sus pruebas (`plugins/process/src/dslContext.ts`, `plugins/process/docs/dsl.md:10-57`); para una pyme es costo de mantenimiento alto y casi nadie lo usará. Mejor un conjunto cerrado de acciones con parámetros tipados.
2. **La arquitectura de colas más servicios aparte (Redpanda, servicio de procesos, polling del worker).** Presupone operar varios servicios; Bash Logistics corre en Netlify Functions y Supabase. Se debe adaptar a triggers de Postgres, funciones programadas y una tabla de eventos (A5).
3. **Modelo de eventos como transacciones sobre un modelo reflexivo (Tx, Card, mixins).** Sirve a su producto flexible, pero no a un ERP con tablas relacionales y RLS; la deduplicación por mapa en memoria (`services/process/src/main.ts:74-88`) tampoco sobrevive a reinicios ni a varias instancias.
4. **Pila de rollback de 30 niveles basada en transacciones inversas.** Funciona en su modelo de eventos; en contabilidad y facturación lo correcto es un asiento o documento de reverso, no deshacer. Cita: `services/process/src/main.ts:487-503`.
5. **`FirstWorkingDayAfter` solo salta sábado y domingo.** No consulta festivos aunque el repo modela `PublicHoliday`; para Colombia produciría fechas de cobro en festivo. Cita: `server-plugins/process-resources/src/transform.ts:243-253`; `models/hr/src/index.ts:179-186`.
6. **Impresión por Chromium en el mismo despliegue serverless.** Arrastra un navegador completo con banderas `--no-sandbox` (`services/print/pod-print/src/print.ts:36-46`) y espera de red inactiva de más de un segundo (`:60-65`); costoso y frágil. Ver A12 para la alternativa gradual.
7. **Exportación de Huly.** `export` copia datos entre espacios de trabajo (`models/export/src/index.ts:34-54`); no es un generador de informes, no sirve para esta dimensión.

## No leído o dudoso

1. **Informes y tableros: el repo no los cubre como dimensión propia.** No encontré un constructor de informes ni de tableros con agregaciones; lo más cercano son las vistas guardadas (A13) y la recolección de eventos de analítica (`services/analytics-collector`, `plugins/analytics-collector`), que no leí. Tampoco hay informes financieros.
2. **Facturación, cartera, contabilidad, inventario y compras no existen como módulos de negocio.** Los modelos `inventory`, `products`, `lead` y `billing` existen en `models/` pero solo los listé; `billing` parece de cobro de la propia plataforma (servicio `payment`, Polar), no de documentos de venta. No los leí.
3. **Posible defecto: la guardia `parallelExecutionForbidden` consulta un campo que no existe.** `RunSubProcess` filtra por `done: false` (`server-plugins/process-resources/src/functions.ts:499`), pero `Execution` tiene `status` y no `done` (`plugins/process/src/index.ts:115-125`). Si el filtro no coincide con nada, la restricción de ejecución paralela no se cumpliría. No lo ejecuté; es lectura estática.
4. **Revisión periódica de documentos: solo el dato, no el programador.** El campo `reviewInterval` y el estado `ToReview` existen (`plugins/controlled-documents/src/types.ts:212`, `:242`), pero no encontré en `server-plugins` ni `services` quien cambie un documento a `ToReview` al vencer el intervalo. Puede estar en código no revisado; no afirmo que falte.
5. **Uso del temporizador en calendario.** `server-plugins/calendar-resources/src/index.ts` usa `TimeMachine` para recordatorios, pero solo lo vi por búsqueda de nombre; no leí su lógica.
6. **Correo saliente.** Leí la construcción de plantillas de notificación, pero no el envío (`services/mail`, `services/gmail`, `services/notification`), ni cómo se limita o agrupa.
7. **Interfaz de procesos.** No leí los componentes Svelte de `plugins/process-resources/src/components` más allá de confirmar el uso de `automationOnly` (`ProcessesExtension.svelte:55`, `RunProcessPopup.svelte:35`); la experiencia real de configurar un flujo no está evaluada.
8. **Migraciones y procesos de ejemplo.** `models/process/src/migration.ts` no lo leí; no sé si el repo trae procesos predefinidos.
9. **Pruebas.** Solo vi la lista de pruebas (por ejemplo `plugins/process/src/__tests__/dslContext.test.ts`); no las leí ni evalué la cobertura del motor de transiciones.
