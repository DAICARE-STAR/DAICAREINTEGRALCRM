# odoo — automatizacion

Alcance: flujos de aprobación y estados, reglas automáticas, tareas programadas, plantillas de correo y documentos, PDF, informes, numeración. Todas las rutas son relativas a `C:\Users\enzov\IA\personal\investigacion-erp\odoo`. Licencia LGPL: solo se describen ideas con palabras propias.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

**Reglas automáticas (disparador, condición, acción)**

1. Una regla es un registro `base.automation` con nombre, modelo objetivo, tipo de disparador, filtros y una lista de acciones de servidor hijas. Hereda del chatter y de actividades, así que los cambios de la propia regla quedan trazados. `addons/base_automation/models/base_automation.py:129-148`.
2. El disparador es un selector cerrado con 18 valores en familias: al fijar un valor (etapa, usuario, etiqueta, estado, prioridad), archivar o desarchivar, ciclo de vida (crear, crear o editar, editar, borrar, cambio en la interfaz), por tiempo (sobre un campo fecha, tras la creación, tras la última edición), por mensaje de correo entrante o saliente, y por webhook. `addons/base_automation/models/base_automation.py:161-185`.
3. Los disparadores "al fijar un valor" no son lógica aparte: se traducen a un dominio de filtro autogenerado. "Etapa = X" produce `[(campo, '=', X)]`, "usuario fijado" produce `[(campo, '!=', False)]`, "archivar" produce `[(activo, '=', False)]`. El motor solo evalúa disparador más dominio. `addons/base_automation/models/base_automation.py:395-422`.
4. Hay dos condiciones: un dominio previo (se evalúa antes del cambio, no aplica al crear) y un dominio posterior ("Aplicar a"). Además `trigger_field_ids` limita la regla a cuando cambia alguno de esos campos; vacío significa vigilar todos. `addons/base_automation/models/base_automation.py:231-259`, `721-748`, `825-843`.
5. Los dominios se guardan como texto y se evalúan con un evaluador restringido (`safe_eval`) sobre un contexto controlado; el filtrado usa `filtered_domain` sobre los registros. `addons/base_automation/models/base_automation.py:721-748`.
6. El motor intercepta create, write, unlink y los cambios de formulario del ORM parchando los modelos al arrancar el registro (`_register_hook`). En create llama al original y luego procesa las reglas sobre los registros que cumplen el dominio posterior. `addons/base_automation/models/base_automation.py:844-880`. Al crear, escribir o cambiar el disparador de una regla se vuelve a parchar el registro. `addons/base_automation/models/base_automation.py:482-503`.
7. La ejecución evita recursión y doble ejecución: lleva en el contexto un mapa `__action_done` de qué reglas ya corrieron sobre qué registros, ejecuta las acciones con privilegios elevados, una por registro, y registra duración y resultado (hecho, fallido, abortado) con nivel de log según el tiempo. `addons/base_automation/models/base_automation.py:759-822` y `34-39`.
8. Los tipos de acción son un conjunto pequeño y cerrado: actualizar registro, crear registro, duplicar registro, ejecutar código, enviar webhook y acción múltiple. `odoo/addons/base/models/ir_actions.py:591-597`. Las acciones de una regla deben ser del mismo modelo que la regla y no pueden colgar de acciones múltiples. `addons/base_automation/models/ir_actions_server.py:25-45`.
9. Una regla puede dispararse desde fuera: cada regla tiene un `webhook_uuid` rotable y una URL; un campo `record_getter` (expresión) decide sobre qué registro correr según la carga recibida, y hay bitácora opcional de llamadas. `addons/base_automation/models/base_automation.py:148-152`, `594-637`.
10. Reglas por tiempo: se declara campo fecha, retraso numérico, modo antes o después y unidad (minutos, horas, días, meses); opcionalmente un calendario laboral para contar días hábiles. `addons/base_automation/models/base_automation.py:204-230`. Una sola tarea programada global las atiende; la regla guarda `last_run` y cada pasada busca registros cuyo campo fecha cae en la ventana entre la última corrida y ahora. `addons/base_automation/models/base_automation.py:1077-1160`. La frecuencia de esa tarea se ajusta sola al retraso más corto (entre 1 minuto y 4 horas, con 10 % de holgura) y se desactiva si no hay reglas por tiempo. `addons/base_automation/models/base_automation.py:639-663`, `704-719`.
11. Si una regla por tiempo falla, la tarea hace rollback del progreso de esa regla, sigue con las demás y relanza la última excepción al final para que la tarea quede marcada como fallida. `addons/base_automation/models/base_automation.py:1161-1202`.
12. El repo no trae ninguna regla `base.automation` precargada (búsqueda de `model="base.automation"` en `addons/` sin resultados): el motor es genérico y las reglas las crea el usuario.

**Tareas programadas**

13. `ir.cron` guarda intervalo (número y unidad), próxima y última ejecución, prioridad, usuario con cuyos permisos corre y contadores de fallos consecutivos. `odoo/addons/base/models/ir_cron.py:101-124`. El proceso de fondo toma los trabajos con `FOR NO KEY UPDATE SKIP LOCKED`, ordenados por fallos, prioridad e id, de modo que dos trabajadores nunca corren el mismo. `odoo/addons/base/models/ir_cron.py:306`, `368`.
14. Autodesactivación por fallos: tras 5 fallos consecutivos y 7 días desde el primero, la tarea se desactiva y se avisa al administrador; 3 timeouts seguidos cuentan como fallo. `odoo/addons/base/models/ir_cron.py:37-39`, `574-640`.
15. Las tareas largas avanzan por lotes con `_commit_progress(procesados, restantes)` y una tabla de progreso, de modo que si se agota el tiempo reanudan donde quedaron. Ejemplo real: envío diferido de correos de pedidos. `odoo/addons/base/models/ir_cron.py:872`, `952-960`; `addons/sale/models/sale_order.py:1745-1760`.
16. Una tarea puede pedirse "ya" o "a esta hora" sin esperar su intervalo mediante `_trigger(at=...)`, que inserta una fila en `ir.cron.trigger`, con ventana de agrupación opcional. `odoo/addons/base/models/ir_cron.py:750-790`, `931-940`.
17. Las tareas de módulos nacen desactivadas y se activan por configuración; ejemplo: correos pendientes de ventas y facturación automática, con `active=False`. `addons/sale/data/ir_cron.xml:4-23`.

**Estados y aprobaciones**

18. Cotización de venta: `draft`, `sent`, `sale`, `cancel`, más un booleano aparte `locked` que no es un estado. `addons/sale/models/sale_order.py:26-31`, `85-97`. Confirmar valida desde qué estados se puede, escribe estado y fecha, ejecuta un gancho posterior y opcionalmente bloquea y envía el correo de confirmación. `addons/sale/models/sale_order.py:1623-1653`, `1660-1665`. El bloqueo automático lo decide un ajuste de la instalación. `addons/sale/models/sale_order.py:1655-1658`.
19. Vencimiento de cotización: no hay estado "vencida"; es un campo calculado y buscable (borrador o enviada con fecha de validez pasada). `addons/sale/models/sale_order.py:1112-1125`.
20. Compras: `draft`, `sent`, `to approve`, `purchase`, `cancel`. Confirmar pasa a "por aprobar" solo si falla `_approval_allowed()`; esta devuelve verdadero si la empresa tiene aprobación de un paso, o de dos pasos con monto menor al umbral (convertido a la moneda del pedido), o si el usuario es del grupo gerente de compras. `addons/purchase/models/purchase_order.py:110-116`, `698-720`, `1332-1341`. Los ajustes viven en la empresa: modo (un paso o dos), umbral (5000 por defecto) y bloqueo del pedido confirmado. `addons/purchase/models/res_company.py:27-40`.
21. Ausencias (RR. HH.): estados `confirm`, `refuse`, `validate1`, `validate`, `cancel`. El tipo de validación vive en el tipo de ausencia (sin validación, solo RR. HH., solo jefe, ambos). `addons/hr_holidays/models/hr_leave.py:134-139`, `159`. Las transiciones permitidas son una tabla `{estado: {estados siguientes}}` que depende del tipo de validación y del rol de quien actúa (oficial, jefe, el propio empleado); una función comprueba si el usuario puede mover a un estado. `addons/hr_holidays/models/hr_leave.py:2497-2552`. Se registran primer y segundo aprobador. `addons/hr_holidays/models/hr_leave.py:196-199`, `2343-2349`.
22. Los cambios de estado quedan en el chatter como valores rastreados (`tracking=True`) con subtipo de mensaje por transición, de modo que se puede suscribir solo a "aprobado". `addons/purchase/models/purchase_order.py:598-611`; `addons/mail/models/mail_track_mixin.py:76-100`.
23. Tiempo en etapa y estancamiento: un mixin guarda en JSON cuántos minutos pasó el registro en cada etapa, y la etapa tiene `rotting_threshold_days` para marcar los registros estancados. En el CRM se activa sobre `stage_id`. `addons/mail/models/mail_tracking_duration_mixin.py:19-24`, `60-75`; `addons/crm/models/crm_stage.py:30`; `addons/crm/models/crm_lead.py:100`, `161`, `379-383`.

**Actividades (tareas de seguimiento)**

24. Tipo de actividad: nombre, resumen, retraso (número, unidad, desde cuándo), icono, modelo al que aplica, siguiente actividad sugerida, plantillas de correo asociadas, usuario o rol por defecto. `addons/mail/models/mail_activity_type.py:27-69`. La actividad es polimórfica (modelo + id), con vencimiento, usuario, estado calculado (vencida, hoy, planificada, hecha) y retroalimentación. `addons/mail/models/mail_activity.py:59-67`, `92-141`.
25. Plan de actividades: una secuencia de pasos para un modelo; cada paso tiene tipo, retraso antes o después de la fecha del plan y asignación (al lanzar, usuario fijo o rol). `addons/mail/models/mail_activity_plan.py:7-31`; `addons/mail/models/mail_activity_plan_template.py:15-66`.

**Plantillas de correo y de documentos**

26. `mail.template` es una plantilla por modelo con asunto, remitente, destinatarios (correo y contactos, ambos con expresiones), cuerpo HTML, adjuntos fijos, informes dinámicos adjuntables, fecha programada de envío y borrado automático. `addons/mail/models/mail_template.py:37-100`. El envío masivo genera todo por lote. `addons/mail/models/mail_template.py:729-845`.
27. El motor de expresiones tiene dos modos: el sencillo (`{{ object.campo }}`), resuelto con una expresión regular sin evaluar código, y uno completo (QWeb) que sí evalúa. Solo los miembros del grupo "editor de plantillas" pueden guardar plantillas con expresiones inseguras. `addons/mail/models/mail_render_mixin.py:291-312`, `575-612`, `638-660`. Al guardar una plantilla se la prueba contra un registro real. `addons/mail/models/mail_template.py:218-243`.
28. Cola de correo: `mail.mail` con estados `outgoing`, `sent`, `received`, `exception`, `cancel`, tipo y motivo de fallo, y reintento manual. Procesa lotes de hasta 1000 con commit tras cada mensaje y respeta `scheduled_date`. `addons/mail/models/mail_mail.py:79-101`, `208`, `229-262`.
29. Envío de facturas: asistente compartido que decide método, plantilla, formato de factura electrónica y PDF por defecto según cliente, luego diario, luego global; el envío masivo es asíncrono por una tarea que toma lotes con bloqueo. `addons/account/models/account_move_send.py:14-70`, `843-860`; `addons/account/models/account_move.py:7260-7275`.

**PDF e informes**

30. Un documento imprimible es un registro `ir.actions.report` con modelo, nombre técnico de la plantilla, formato (HTML, PDF, texto), formato de papel, grupos que pueden imprimirlo, dominio que decide en qué registros aparece, nombre de archivo como expresión y opciones para guardar el PDF como adjunto y reutilizarlo. `odoo/addons/base/models/ir_actions_report.py:37-72`. Ejemplo: el nombre del PDF de ventas cambia entre "Cotización" y "Pedido" según el estado. `addons/sale/report/ir_actions_report.xml:5-11`.
31. El PDF se genera renderizando una plantilla HTML con wkhtmltopdf (motor configurable), separando por registro y fusionando. Un adjunto guardado se reutiliza si el nombre coincide. `odoo/addons/base/models/ir_actions_report.py:154-168`, `625-662`, `677-748`, `788-840`.
32. Informes analíticos: modelos sin tabla propia (`_auto = False`) respaldados por una vista SQL creada en `init()`. Ventas agrega por línea con conversión de moneda y de unidad; actividades de CRM une mensajes y actividades. `addons/sale/report/sale_report.py:14`, `136-175`; `addons/crm/report/crm_activity_report.py:11`, `84-93`.
33. Resumen periódico por correo: `digest.digest` con KPI activables por módulo; cada módulo agrega los suyos (nuevos clientes potenciales, oportunidades ganadas) con un grupo requerido y la acción a abrir. `addons/crm/models/digest.py:10-39`.

**Numeración**

34. `ir.sequence`: código, prefijo y sufijo con variables de fecha (año, mes, día, semana, etc., en tres versiones: del documento, del rango y actual), relleno de ceros, incremento, siguiente número, empresa, y dos implementaciones: "estándar" (secuencia nativa de Postgres, rápida, admite huecos) y "sin huecos" (fila con `FOR UPDATE NOWAIT`, más lenta). `odoo/addons/base/models/ir_sequence.py:57-63`, `129-152`, `223-258`. Con "usar rangos de fecha" crea una subsecuencia por periodo, al vuelo si no existe. `odoo/addons/base/models/ir_sequence.py:114-127`, `260-287`.
35. Ventas asigna el número al crear (si el nombre es "Nuevo") usando la fecha del pedido y la empresa; la secuencia de datos es prefijo `S` y relleno 5. `addons/sale/models/sale_order.py:1455-1469`; `addons/sale/data/ir_sequence_data.xml:4-9`.
36. Contabilidad no usa `ir.sequence`: el `sequence.mixin` deduce el formato del último nombre existente con expresiones regulares (anual, mensual, rango de años, fijo), reinicia por periodo y exige coherencia entre fecha y número. `addons/account/models/sequence_mixin.py:28-46`, `194-225`. Garantiza unicidad bajo concurrencia con un índice único y bloqueo por fila en una actualización con savepoint, más caché transaccional. `addons/account/models/sequence_mixin.py:51-80`, `357-425`. Asigna al publicar, no al crear. `addons/account/models/sequence_mixin.py:427-451`.
37. Inalterabilidad: el diario puede exigir cadena de hashes; cada asiento publicado guarda un número secuencial sin huecos y un hash, y los campos protegidos no se pueden modificar. `addons/account/models/account_move.py:361-363`, `4045-4047`, `4743-4754`.

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| base.automation (regla) | nombre, activo, trigger, filtro previo, filtro posterior, campos vigilados, campo fecha, retraso, modo, unidad, calendario, last_run, webhook_uuid, record_getter | modelo objetivo; 1..N acciones de servidor | `addons/base_automation/models/base_automation.py:129-259` |
| ir.actions.server (acción) | tipo (escribir, crear, duplicar, código, webhook, múltiple), modelo, usage, regla padre | N..1 regla; hija de acción múltiple | `odoo/addons/base/models/ir_actions.py:591-597`; `addons/base_automation/models/ir_actions_server.py:11-45` |
| ir.cron | intervalo, unidad, nextcall, lastcall, prioridad, failure_count, first_failure_date, usuario | 1..1 acción de servidor; 1..N ir.cron.trigger; 1..N ir.cron.progress | `odoo/addons/base/models/ir_cron.py:101-124`, `931-960` |
| mail.template | modelo, asunto, remitente, destinatarios, cuerpo HTML, scheduled_date, auto_delete | N..N adjuntos; N..N informes; N..1 servidor de correo | `addons/mail/models/mail_template.py:37-100` |
| mail.mail (cola) | state, scheduled_date, failure_type, failure_reason, auto_delete | N..1 mensaje; N..N destinatarios | `addons/mail/models/mail_mail.py:79-110` |
| mail.activity.type | nombre, retraso, desde, modelo, siguiente sugerida, usuario o rol por defecto | N..N plantillas de correo; N..N tipos previos | `addons/mail/models/mail_activity_type.py:27-69` |
| mail.activity | modelo, res_id, tipo, vencimiento, usuario, rol, estado calculado, feedback | N..1 tipo; N..1 plan y paso de plan | `addons/mail/models/mail_activity.py:59-141` |
| mail.activity.plan y .template | modelo, pasos con retraso, antes o después, asignación (demanda, usuario, rol) | 1..N pasos; paso N..1 tipo | `addons/mail/models/mail_activity_plan.py:7-31`; `addons/mail/models/mail_activity_plan_template.py:15-66` |
| ir.actions.report | modelo, report_name, formato, papel, grupos, dominio, print_report_name, attachment, attachment_use | N..1 formato de papel; N..N grupos | `odoo/addons/base/models/ir_actions_report.py:37-72` |
| ir.sequence | código, prefijo, sufijo, relleno, incremento, siguiente, implementación, rangos de fecha, empresa | 1..N date_range | `odoo/addons/base/models/ir_sequence.py:129-152` |
| crm.stage | nombre, secuencia, es ganada, días para estancarse, plegada | N..N equipos | `addons/crm/models/crm_stage.py:27-37` |
| crm.lead (campos de flujo) | stage_id, date_last_stage_update, probability, duration_tracking | N..1 etapa | `addons/crm/models/crm_lead.py:100`, `161`, `218-251` |
| sale.report, crm.activity.report | columnas agregadas, sin tabla | vista sobre tablas operativas | `addons/sale/report/sale_report.py:14`; `addons/crm/report/crm_activity_report.py:11` |
| digest.digest | KPI booleanos y valor calculado por módulo | por usuario y empresa | `addons/crm/models/digest.py:10-30` |

## Decisiones de diseño que se notan y su porqué

- **Regla = disparador + dominio + acciones.** Los disparadores cómodos ("etapa fijada") son atajos que generan un dominio; el motor solo evalúa dominios y el usuario ve opciones simples. `addons/base_automation/models/base_automation.py:395-422`.
- **Una sola tarea para todas las reglas por tiempo, con frecuencia adaptativa.** Evita una tarea por regla y limita el costo de sondeo. `addons/base_automation/models/base_automation.py:639-719`.
- **Marca de ejecución por regla (`last_run`) y ventana de fechas**, en vez de bandera por registro: una regla nueva no dispara sobre el histórico y no se duplica entre pasadas. `addons/base_automation/models/base_automation.py:1077-1160`.
- **Fallar sin parar a las demás reglas**, pero dejar la tarea en rojo al final. `addons/base_automation/models/base_automation.py:1161-1202`.
- **Estado = columna de selección pequeña; lo demás son banderas aparte** (`locked`, vencida calculada). Evita multiplicar estados. `addons/sale/models/sale_order.py:26-31`, `85-97`, `1112-1125`.
- **Aprobación por umbral en la empresa, no por flujo configurable.** Compras resuelve "quién aprueba" con una pregunta booleana y un rol: poca configuración y cubre buena parte de las pymes. `addons/purchase/models/purchase_order.py:1332-1341`.
- **Matriz de transiciones calculada por rol** cuando la aprobación es más rica (ausencias). `addons/hr_holidays/models/hr_leave.py:2497-2552`.
- **Plantillas con dos niveles de poder**, para que un usuario común no ejecute código por una plantilla. `addons/mail/models/mail_render_mixin.py:291-312`.
- **Numeración doble:** secuencia nativa (rápida, con huecos) para documentos internos y secuencia derivada del último nombre, con bloqueo por índice único, para contabilidad que exige continuidad. `odoo/addons/base/models/ir_sequence.py:129-135`; `addons/account/models/sequence_mixin.py:357-425`.
- **Informes como vistas SQL con modelo declarativo**, para reutilizar filtros, agrupaciones, permisos y exportación del mismo framework. `addons/sale/report/sale_report.py:14`.
- **Todo lo diferido va por cola o tarea con lotes y commits parciales** (correo, facturas, pedidos), para que un fallo no pierda lo ya enviado. `addons/mail/models/mail_mail.py:229-262`; `addons/account/models/account_move.py:7260-7275`.

## Adoptable para TailorSuite (lista numerada A1, A2…)

**A1. Motor de reglas "disparador + condición + acciones" con catálogo cerrado.** Tabla `reglas_automaticas` (módulo, evento, condición, acciones) con eventos como crear, cambiar campo, fijar etapa, fijar responsable y por tiempo. Condición como JSON de filtros propio, no texto evaluable. Cita: `addons/base_automation/models/base_automation.py:129-185`, `395-422`. Le sirve a una pyme para "cuando la oportunidad pasa a Propuesta, crear una tarea a las 48 h" sin pedir desarrollo. Esfuerzo: alto el motor completo; medio si se limita a 3 eventos y 3 acciones.

**A2. Ejecución de reglas en el servidor de la base.** Odoo parcha create y write del ORM; el equivalente en Supabase es un trigger que encola un evento y una Netlify Function o tarea programada que lo procesa. Cita: `addons/base_automation/models/base_automation.py:844-880`. Garantiza que la regla corre sin importar desde qué pantalla se editó. Esfuerzo: alto.

**A3. Evitar recursión y repetición con un registro de ejecuciones.** Tabla `reglas_ejecuciones(regla, registro, evento)` con unicidad, o un identificador de cadena en el evento. Cita: `addons/base_automation/models/base_automation.py:759-822`. Una regla que modifica el registro que la dispara puede entrar en bucle. Esfuerzo: bajo.

**A4. Reglas por tiempo con `last_run` por regla y una sola tarea de barrido.** Cada N minutos busca registros cuyo campo fecha cayó entre `last_run` y ahora, aplica el desfase (antes o después, unidad) y actualiza `last_run`. Cita: `addons/base_automation/models/base_automation.py:1077-1160`, `1161-1202`. Sirve para recordatorios de cotización por vencer, cartera vencida y lead sin actividad. Esfuerzo: medio.

**A5. Tareas con lotes, avance guardado y autodesactivación por fallos.** Tabla `tareas_programadas(nombre, intervalo, proxima, fallos, primer_fallo, activa)` y progreso por lote; desactivar y avisar al administrador tras 5 fallos y 7 días. Cita: `odoo/addons/base/models/ir_cron.py:37-39`, `574-640`, `872`. En una instalación por cliente nadie vigila los logs; el aviso en el portal es la señal. Esfuerzo: medio.

**A6. Bloqueo de trabajos con `FOR UPDATE SKIP LOCKED`.** Evita que dos ejecuciones de la misma tarea se pisen si Netlify reintenta. Cita: `odoo/addons/base/models/ir_cron.py:368`. Esfuerzo: bajo.

**A7. Aprobación por umbral configurable por instalación (compras, gastos, descuentos).** En ajustes: modo (directo o con aprobación), monto umbral y rol aprobador. Confirmar pasa a "por aprobar" si el monto supera el umbral y el usuario no tiene el rol. Cita: `addons/purchase/models/purchase_order.py:698-720`, `1332-1341`; `addons/purchase/models/res_company.py:27-40`. Cubre el caso típico de una pyme con dueño que aprueba lo grande y encaja con los roles y permisos que ya existen. Esfuerzo: bajo.

**A8. Matriz de transiciones de estado como dato, comprobada en una función única.** Un diccionario `{estado: {siguientes}}` por documento y rol, con una función `puede_pasar(a)` usada en los botones y en un trigger o política que rechaza transiciones inválidas. Cita: `addons/hr_holidays/models/hr_leave.py:2497-2552`. Un mismo mecanismo para RR. HH., compras y cartera, con la validación en la base y no solo en React. Esfuerzo: medio.

**A9. Estado corto más banderas separadas (bloqueado, vencido calculado).** No añadir estados "vencida" ni "bloqueada"; usar columna generada o vista. Cita: `addons/sale/models/sale_order.py:26-31`, `85-97`, `1112-1125`. Menos estados implica menos transiciones que mantener y menos errores en los informes. Esfuerzo: bajo.

**A10. Historial de tiempo por etapa y alerta de estancamiento.** Guardar un JSON de minutos por etapa (o una tabla de eventos de etapa) y un umbral de días por etapa para marcar "estancado". Cita: `addons/mail/models/mail_tracking_duration_mixin.py:19-48`; `addons/crm/models/crm_stage.py:30`. Es la métrica más barata y útil del CRM de una pyme: qué oportunidades se enfrían. Esfuerzo: medio; bajo si solo se guarda `fecha_ultimo_cambio_etapa` y el umbral.

**A11. Plan de actividades: secuencia de pasos con desfase y responsable por rol.** Plantilla de pasos (tipo, días, antes o después, usuario, rol o "preguntar al lanzar") que se instancia sobre una cuenta u oportunidad. Cita: `addons/mail/models/mail_activity_plan.py:7-31`; `addons/mail/models/mail_activity_plan_template.py:15-66`. Estandariza el seguimiento comercial y la incorporación de empleados con una sola función. Esfuerzo: medio.

**A12. Tipo de actividad con siguiente actividad sugerida y plantilla de correo asociada.** Cita: `addons/mail/models/mail_activity_type.py:32-69`. Al marcar una llamada como hecha, el sistema propone la siguiente, lo que reduce el abandono del seguimiento. Esfuerzo: bajo.

**A13. Plantillas de correo y de documento con marcadores simples y sin código.** Solo `{{cuenta.nombre}}` con lista blanca de campos, resuelto en el servidor sin evaluar código; un rol "editor de plantillas" solo si luego se admite algo más. Cita: `addons/mail/models/mail_render_mixin.py:291-312`, `575-612`, `638-660`. El cliente edita sus textos sin riesgo de inyección en un entorno de una sola base. Esfuerzo: medio.

**A14. Validar la plantilla al guardarla renderizándola contra un registro real.** Cita: `addons/mail/models/mail_template.py:218-243`. Evita descubrir un marcador roto cuando ya se envía a cien clientes. Esfuerzo: bajo.

**A15. Cola de correo con estados, motivo de fallo y reintento manual.** Tabla `correos_salida(estado, programado_para, tipo_fallo, motivo, intentos)` y una función que procesa lotes. Cita: `addons/mail/models/mail_mail.py:79-101`, `208`, `229-262`. Separa "redactar" de "enviar", permite programar y muestra en el portal qué correos fallaron. Esfuerzo: medio.

**A16. Definición de documento imprimible como dato.** Registro por tipo de documento con plantilla, nombre de archivo por expresión segura, roles que pueden imprimir y opción de guardar el PDF como adjunto inmutable. Cita: `odoo/addons/base/models/ir_actions_report.py:49-72`, `154-168`, `625-662`; nombre cambiante en `addons/sale/report/ir_actions_report.xml:9`. Cotización y factura con numeración y nombre correctos y copia guardada para auditoría. Esfuerzo: medio; el costo real es generar el PDF en Netlify Functions.

**A17. Informes como vistas SQL de solo lectura que respetan RLS.** Una vista por informe (ventas por producto y vendedor, actividades por usuario), con `security_invoker` en Postgres para heredar RLS, consumida por React con filtros y agrupaciones. Cita: `addons/sale/report/sale_report.py:14`, `136-175`; `addons/crm/report/crm_activity_report.py:84-93`. Los tableros salen de la base sin duplicar lógica ni datos. Esfuerzo: medio.

**A18. Resumen periódico con KPI activables por módulo.** Tabla de KPI registrados por módulo (clave, consulta, permiso requerido) y envío semanal por correo a quien lo active. Cita: `addons/crm/models/digest.py:10-39`. Encaja con "módulos a la carta": cada módulo instalado suma sus KPI sin tocar el resto. Esfuerzo: medio.

**A19. Numeración con prefijo, relleno y variables de fecha, en dos modos (rápido con huecos, estricto sin huecos).** Tabla `secuencias(codigo, prefijo, sufijo, relleno, reinicio_anual, implementacion)` y una función Postgres `siguiente_numero(codigo, fecha)` con `FOR UPDATE` para el modo estricto y `nextval` para el rápido. Cita: `odoo/addons/base/models/ir_sequence.py:57-63`, `129-152`, `223-258`, `277-287`. El número de cotización admite huecos; el de factura, no. Esfuerzo: bajo.

**A20. Asignar el número de documento contable al publicar, no al crear.** Cita: `addons/account/models/sequence_mixin.py:427-451`; ventas lo hace al crear, `addons/sale/models/sale_order.py:1455-1469`. Evita huecos por borradores descartados en facturación y cartera. Esfuerzo: bajo.

## No conviene copiar (y por qué)

- **Acción "ejecutar código" y dominios en texto evaluados con `safe_eval`.** Es el mayor riesgo del motor y obliga a todo un aparato de grupos y sandbox. `odoo/addons/base/models/ir_actions.py:591-597`; `addons/base_automation/models/base_automation.py:721-748`. En TailorSuite las condiciones deben ser JSON declarativo y las acciones un catálogo cerrado.
- **Parchar create y write en tiempo de ejecución** (`_register_hook`). Es una técnica del ORM de Python sin equivalente sano en Postgres; usar triggers y cola de eventos. `addons/base_automation/models/base_automation.py:844-880`.
- **Disparador "cambio en la interfaz" (`on_change`).** Mezcla lógica de formulario con automatización; en React se resuelve en el propio formulario. `addons/base_automation/models/base_automation.py:161-185`.
- **Días hábiles con calendario por registro** en reglas por tiempo: costoso y poco necesario al inicio. `addons/base_automation/models/base_automation.py:1094-1130`.
- **Motor QWeb completo en plantillas y wkhtmltopdf como dependencia.** El motor completo no aporta a una pyme y wkhtmltopdf no corre bien en Netlify Functions; hay que evaluar un generador alternativo antes de decidir. `odoo/addons/base/models/ir_actions_report.py:788-840`.
- **`sequence.mixin` que deduce el formato del último nombre con expresiones regulares.** Frágil y pensado para migraciones de contabilidades ajenas; mejor una tabla de secuencias explícita (A19). `addons/account/models/sequence_mixin.py:28-46`, `194-225`.
- **Chatter genérico (`mail.thread`) como base de todo** (rastreo, suscriptores, subtipos). Es el modelo de herencia múltiple de Odoo; TailorSuite ya tiene auditoría y avisos. Copiar solo la idea de rastrear campos marcados. `addons/mail/models/mail_thread.py:143`.
- **Cadena de hashes de asientos** hasta que exista contabilidad; es un requisito fiscal de ciertos países y no se asumió para Colombia. `addons/account/models/account_move.py:361-363`.

## No leído o dudoso

- **web_studio (Enterprise)** no está en el repo: el constructor visual de flujos e informes no se pudo estudiar. Es referencia de producto, no hace falta para las ideas anteriores.
- **l10n_co_edi (Enterprise)** no está: la facturación electrónica DIAN y su numeración con resolución no se puede ver. `addons/l10n_co` solo trae plan de cuentas y datos de terceros (`addons/l10n_co/models/template_co.py`, `addons/l10n_co/models/res_partner.py`); no se encontró numeración propia ni plantillas de documentos colombianos. Para numeración con resolución DIAN (prefijo, rango autorizado y vigencia) este repo no ayuda.
- **Plantillas XML de informes (QWeb) y vistas** no se leyeron a fondo, salvo la declaración del informe de ventas; el diseño visual de cotización y factura queda sin analizar.
- **`mail_thread.py` y `mail_track_mixin.py`** se leyeron solo en las partes de rastreo, no completos.
- **Acción "webhook" saliente**: se confirmó como tipo (`odoo/addons/base/models/ir_actions.py:596`), pero no se leyó su implementación de envío ni reintentos.
- **Tableros de CRM y ventas** (vistas gráfica y dinámica, menús) son XML de vistas; solo se leyeron los modelos SQL que los alimentan. No se estudió el cliente web (JS).
- **`hr_leave_accrual_plan`, `mrp` y `project`** no se leyeron para esta dimensión.
- Algunos rangos amplios (por ejemplo `677-748` en `ir_actions_report.py` o `729-845` en `mail_template.py`) se citan por el método que contienen, sin haberse leído línea por línea; las rutas y los inicios de rango fueron verificados.
