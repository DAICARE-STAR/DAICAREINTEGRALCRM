# platform — modulos

Repo: Huly Platform (hcengineering/platform), licencia EPL-2.0 (ver `models/inventory/package.json`, campo license, y las cabeceras de archivos). Todas las citas son rutas relativas a la raíz del repo `platform`. Se estudian ideas; no se copia código.

Alcance real: Huly es una plataforma de gestión de proyectos, CRM ligero, RR. HH., reclutamiento y documentos. NO es un ERP: no hay compras, ventas, facturación, cartera ni contabilidad. Su valor para TailorSuite está en el mecanismo de módulos (activar/desactivar, vistas, permisos), no en el catálogo de dominio.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

1. **Cada módulo es un paquete "model" con una función `createModel(builder)` y un id de plugin.** El módulo declara sus clases, vistas, acciones y su aplicación en un solo punto. Ejemplo: `models/inventory/src/index.ts:79` (`createModel`), con `inventoryId` exportado en `models/inventory/src/index.ts:29`.

2. **Existe un catálogo central de módulos en una lista de tuplas (función de modelo, id, configuración).** `models/all/src/index.ts:170` abre la lista `builders`; cada entrada trae `label`, `description`, `enabled`, `beta`, `icon`, `classFilter` (ejemplos: lead `models/all/src/index.ts:254-263`, inventario `:278-287`, RR. HH. `:300-308`, productos `:454-463`, documentos controlados `:418-427`).

3. **La activación de un módulo es una fila de datos, no un despliegue.** Por cada módulo, el bucle de `models/all/src/index.ts:573-594` registra los ids de las transacciones que ese módulo generó (`transactions: txes.map(...)`) dentro de un documento `PluginConfiguration` con `enabled`, `hidden`, `beta` y un id estable `plugin-configuration-<id>`. La interfaz está en `foundations/core/packages/core/src/classes.ts:293-312` (campos `pluginId`, `transactions`, `enabled`, `system`, `hidden`, `beta`, `classFilter`).

4. **Desactivar un módulo filtra el modelo, no borra datos.** `pluginFilterTx` (`foundations/core/packages/core/src/utils.ts:832`) descarta del modelo las transacciones del módulo apagado; `classFilter` limita el descarte a ciertas clases. La lista `defaultFilter` (`models/all/src/index.ts:157-168`) solo contiene clases de interfaz (Application, Action, ComponentPointExtension, categorías de ajustes, widgets), así que apagar un módulo quita su entrada de menú, acciones y búsqueda, pero deja las clases de datos y las filas. En el cliente la regla es `returnUITxes` (`foundations/core/packages/client-resources/src/index.ts:185-194`): se excluye un módulo si `!enabled`, si el plugin no está en `getPlugins()` (lo que el despliegue incluye) o si está en una lista extra.

5. **Módulos de sistema no se pueden apagar.** `system?: true` en `foundations/core/packages/core/src/classes.ts:293-312` (comentario del campo: "no permitirá deshabilitar"); contactos y facturación lo usan (`models/all/src/index.ts:197` y `:506`). `fillConfiguration` ignora un cambio sobre un módulo de sistema salvo que lo haga la cuenta de configuración (`foundations/core/packages/core/src/utils.ts:811-830`, condición en la línea 823).

6. **Solo el propietario del espacio de trabajo puede activar o desactivar.** El middleware del servidor rechaza cualquier escritura sobre `PluginConfiguration` si el rol no es Owner (`foundations/server/packages/middleware/src/pluginConfig.ts:51-77`, regla en la línea 60). La interfaz de activación es una lista de interruptores que hace `client.update(config, { enabled })` (`plugins/setting-resources/src/components/Configure.svelte:32-33`; filtro de módulos visibles en `:47`).

7. **Los valores por defecto de activación muestran el mínimo útil según el propio producto.** Encendidos de fábrica: contactos (sistema), chat, calendario, reclutamiento, seguimiento de incidencias (tracker), documentos, RR. HH., preguntas, correo (`models/all/src/index.ts:191-440`). Apagados de fábrica: lead (`:254-263`), inventario (`:278-287`), productos (`:454-463`), documentos controlados (`:418-427`), formación (`:441-452`), encuestas (`:477-488`). Algunos son `hidden: true` y no aparecen en la lista (board, bitrix, request: `:342`, `:355`, `:368`).

8. **Cada módulo declara su aplicación de menú con un registro `workbench.class.Application`.** Campos: `label`, `icon`, `alias`, `position`, `hidden`, `accessLevel` (rol mínimo para verla), `order` (`models/workbench/src/index.ts:45-55`). La navegación lateral va en `navigatorModel` con `specials` (vistas fijas, cada una con componente y `accessLevel`) y `spaces` (clases de espacio que el usuario crea): Lead en `models/lead/src/index.ts:80-143`, inventario en `models/inventory/src/index.ts:152-185`. Cada usuario puede ocultar una aplicación para sí con la preferencia `HiddenApplication` (`models/workbench/src/index.ts:63-66`).

9. **Las dependencias entre módulos son dependencias de paquete, no un manifiesto.** No hay un archivo de dependencias de módulo: el paquete `model-lead` depende de `model-contact`, `model-task`, `model-tracker`, `model-chunter`, etc. (`models/lead/package.json:44-52`) y su código importa esas clases. Apagar `contact` lo impide `system: true`; para apagar `task` o `tracker` con `lead` encendido no se encontró guarda explícita (ver "No leído o dudoso").

10. **Un módulo extiende entidades de otro con "mixins" en vez de tablas nuevas.** El cliente del CRM es un mixin sobre `Contact`: `lead.mixin.Customer` añade `leads` y `customerDescription` a un contacto existente (`models/lead/src/types.ts:92-101`). Igual con `Staff` sobre `Employee` en RR. HH. (`models/hr/src/index.ts:109-114`) y `Candidate` sobre `Person` en reclutamiento (`models/recruit/src/types.ts:103`). Así los módulos comparten una sola lista de personas y organizaciones (`models/contact/src/index.ts:129`, `:210`, `:235`).

11. **Permisos: roles por tipo de espacio, no por módulo.** Hay una clase `Permission` con `scope`, `txClass`, `forbid`, `objectClass`, `txMatch` (definiciones base en `models/core/src/permissions.ts:20-88`: crear, actualizar, borrar, prohibir borrar, actualizar y archivar espacio). Un `SpaceType` agrupa `roles` (cada `Role` lleva una lista de permisos) y se asigna a cada miembro del espacio (`models/core/src/security.ts:96-160`). El servidor lo evalúa en `checkPermission` (`foundations/server/packages/middleware/src/spacePermissions.ts:165-230`): primero busca un permiso explícito del usuario con coincidencia, luego uno sin coincidencia, y si el espacio es restringido y existe un permiso que aplica a la clase pero el usuario no lo tiene, deniega. Lead añade un permiso de tipo "prohibir" (`models/lead/src/permissions.ts:14-17`) y productos define roles propios con listas de permisos (`models/products/src/roles.ts:20-57`).

12. **Los datos de un módulo viven en un dominio propio y se indexan por configuración.** Inventario usa `DOMAIN_INVENTORY` (`models/inventory/src/index.ts:33`) y una `DomainIndexConfiguration` que deshabilita índices innecesarios (`models/inventory/src/index.ts:233-243`). Permite afinar el almacenamiento por módulo.

13. **Migraciones por módulo con estados nombrados e idempotentes.** Cada módulo exporta una operación con `migrate` y `upgrade`; cada paso lleva un `state` único que se registra para no repetirse (`models/lead/src/migration.ts:194-199` crea el embudo por defecto con estado `u-default-funnel`; el mismo archivo renombra un campo con `$rename` en `:170-185`). El ayudante es `tryUpgrade` en `foundations/core/packages/model/src/migration.ts:213`. Semillas por módulo (embudo por defecto, secuencia de numeración): `models/lead/src/migration.ts:34-58`.

14. **Numeración de documentos mediante secuencias.** `Sequence` (contador por clase) y `CustomSequence` (con prefijo) en `models/core/src/core.ts:420-432`; Lead crea su secuencia al sembrar (`models/lead/src/migration.ts:57`). La clase de lead declara el prefijo visible `'LEAD'` en `models/lead/src/types.ts:70`.

15. **Estados configurables por plantilla (embudos y flujos).** Un `ProjectType` (plantilla) lista `tasks` y `statuses`; un `TaskType` enlaza descriptor, estados y categorías (`models/task/src/index.ts:175-228`). Lead define 8 estados con categoría (sin empezar, activo, ganado, perdido) en `models/lead/src/spaceType.ts:24-79` y los ensambla en el tipo de proyecto "Default funnel" en `:164-178`. El usuario puede crear otros embudos desde la misma plantilla.

16. **Entidades definidas por el usuario sin código: Card, MasterTag y Tag.** `MasterTag` es una clase creada en tiempo de ejecución, `Tag` es un mixin creado en tiempo de ejecución, y `Card` es el documento (`models/card/src/index.ts:95-135`). Los permisos pueden apuntar a esas clases (`models/card/src/index.ts:215-218`).

17. **Motor de procesos (automatización) como módulo aparte.** `Process` (sobre un MasterTag), `State`, `Transition` (de estado a estado con acciones y disparador), `Trigger`, `Execution`, `ExecutionLog` y tareas de aprobación (`models/process/src/index.ts:89-210`, `:224-240`). La ejecución guarda `rollback` y un registro auditable.

18. **Catálogo de módulos que realmente existen (una línea cada uno).** Tomados de `models/` y de las entradas de `models/all/src/index.ts`: contact (personas y organizaciones, sistema); chunter (chat y comentarios); calendar (calendarios y eventos, `models/calendar/src/index.ts:83,101`); task (base de proyectos, tipos de tarea y estados); tracker (incidencias, hitos, estimaciones, horas imputadas, `models/tracker/src/types.ts:186,361,433`); lead (embudo comercial con clientes); recruit (vacantes, candidatos, solicitudes, entrevistas, `models/recruit/src/types.ts:66-229`); hr (departamentos, personal, solicitudes de ausencia, festivos, `models/hr/src/index.ts:70-190`); document (documentos colaborativos); controlled-documents (gestión documental con revisión y aprobación, orientada a calidad); products (productos con versiones, orientado a documentación de producto, `models/products/src/index.ts:89-148`); inventory (catálogo de categorías, productos y variantes con SKU); drive (archivos); training y questions (formación y cuestionarios); survey (encuestas); test-management (casos de prueba); process (automatización); card (tipos definidos por el usuario); love (oficina virtual, llamadas); gmail, telegram, huly-mail, bitrix (integraciones de canal); billing (niveles de almacenamiento y tráfico del servicio alojado, `models/billing/src/index.ts:28-39`); setting (ajustes e integraciones). No existe ningún módulo de compras, ventas, facturas, cartera, contabilidad, almacén con existencias ni nómina: el listado de `models/` no contiene esas carpetas.

19. **El módulo `inventory` es solo un catálogo, sin existencias.** Define Category, Product y Variant con SKU y nada más (`models/inventory/src/index.ts:34-77`): no hay cantidades, bodegas, movimientos, costos ni unidades de medida. Las interfaces públicas están en `plugins/inventory/src/index.ts`. El módulo `products` es otra cosa: versiona documentación de producto con estados de versión (`models/products/src/index.ts:113-160`).

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| PluginConfiguration | pluginId, transactions[], enabled, system, hidden, beta, classFilter[], label, description, icon | Apunta a las transacciones del modelo que activa o apaga | `foundations/core/packages/core/src/classes.ts:293-312`; `models/core/src/core.ts:365-373` |
| Application (módulo en menú) | label, icon, alias, position, hidden, accessLevel, order | Enlazada por `alias` con el id de plugin; `ApplicationNavModel.extends` | `models/workbench/src/index.ts:45-61` |
| HiddenApplication (preferencia) | attachedTo -> Application | Por usuario | `models/workbench/src/index.ts:63-66` |
| Contact / Person / Organization | name, city, channels, attachments, comments; Organization: description, members | Base compartida por todos los módulos; Member une Person con Organization | `models/contact/src/index.ts:129-165`, `:210`, `:235-243` |
| Customer (mixin de Contact) | leads (colección), customerDescription | Extiende Contact; tiene N Lead | `models/lead/src/types.ts:92-101` |
| Lead (tarea) | title, startDate, assignee, status, space | attachedTo -> Customer; space -> Funnel | `models/lead/src/types.ts:69-90` |
| Funnel (espacio) | fullDescription, attachments, comments, type | Es un Project de task; contiene Lead | `models/lead/src/types.ts:55-67` |
| Space / TypedSpace / SpaceType / Role | name, private, archived, members[], owners[], type; Role.permissions[] | Un SpaceType tiene N Role; un Space tiene un SpaceType | `models/core/src/security.ts:60-160` |
| Permission | label, scope, txClass, objectClass, txMatch, forbid | Referenciado por Role.permissions | `models/core/src/permissions.ts:20-88`; evaluador `foundations/server/packages/middleware/src/spacePermissions.ts:165-230` |
| ProjectType / TaskType / Status | tasks[], statuses[], descriptor, targetClass; TaskType: statusCategories, kind | ProjectType agrupa TaskType; TaskType lista Status | `models/task/src/index.ts:175-228` |
| Sequence / CustomSequence | attachedTo (clase), sequence, prefix | Un contador por clase | `models/core/src/core.ts:420-432` |
| Category / Product / Variant (inventory) | name; Variant.sku; Product.photos, attachments | Category 1:N Product 1:N Variant (todos AttachedDoc) | `models/inventory/src/index.ts:34-77` |
| Department / Staff / Request / PublicHoliday (hr) | Department: parent, teamLead, members, managers; Staff: department; Request: tzDate, tzDueDate, type; PublicHoliday: date, department | Staff es mixin de Employee; Request colgada de Staff | `models/hr/src/index.ts:70-190` |
| MasterTag / Tag / Card | Card: title, content, parent, space | Tipos de usuario creados en ejecución | `models/card/src/index.ts:95-135` |
| Process / Transition / Execution / ExecutionLog | Process: masterTag, initState, autoStart; Transition: from, to, trigger, actions; Execution: currentState, status, rollback | Process 1:N Transition; Execution 1:N ExecutionLog | `models/process/src/index.ts:89-210` |
| Integration / IntegrationType | type, disabled, shared[]; IntegrationType: allowMultiple, kind | Integration -> IntegrationType | `models/setting/src/index.ts:62-100` |
| Tier (facturación del servicio) | storageLimitGB, trafficLimitGB, priceMonthly | Límites por nivel de almacenamiento | `models/billing/src/index.ts:28-39` |

## Decisiones de diseño que se notan y su porqué

- **Todo el sistema es un modelo declarativo cargado a la base como transacciones.** El motivo aparente es que cliente y servidor comparten el mismo modelo y el módulo se puede encender o apagar filtrando transacciones (`pluginFilterTx`, `foundations/core/packages/core/src/utils.ts:832`). Costo: el modelo de datos real no es tablas SQL legibles, está en un motor propio.
- **Apagar un módulo solo oculta la interfaz (`defaultFilter`).** Evita pérdida de datos si alguien lo apaga por error; la contrapartida es que los datos de un módulo apagado siguen ocupando espacio y pueden seguir apareciendo en vistas que lean esas clases.
- **Módulos de sistema no apagables (`system: true`).** Protege el núcleo común (contactos) de que otro módulo quede huérfano.
- **El permiso se evalúa en el servidor, a nivel de espacio, contra una transacción.** Permite roles distintos por embudo o proyecto (`spacePermissions.ts`), no solo por rol global: una misma persona es gerente en un embudo y lectora en otro.
- **Mixins en vez de tablas por módulo para extender personas y organizaciones.** Evita duplicar contactos entre CRM, RR. HH. y reclutamiento.
- **Plantillas de espacio con estados editables por el usuario.** El embudo de ventas no está fijo en código; Lead solo trae una plantilla por defecto (`models/lead/src/spaceType.ts:164-178`).
- **El propietario es el único que activa módulos y los módulos de negocio nuevos nacen apagados.** Coincide con "módulos a la carta que activa quien instala".

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Registro de módulos como datos, con una fila por módulo y bandera `enabled`.** Una tabla `modulos` (id, etiqueta, descripción, icono, enabled, sistema, oculto, beta) sembrada al instalar cada módulo. Respaldo: `models/all/src/index.ts:573-594` y `foundations/core/packages/core/src/classes.ts:293-312`. Sirve porque quien instala enciende solo lo que el cliente compró, sin redeploy. Esfuerzo: bajo.

**A2. Bandera `sistema` que impide apagar el núcleo.** Restricción en la tabla y en la función que cambia `enabled` (miembros, roles, auditoría, avisos y cuentas no se apagan). Respaldo: `foundations/core/packages/core/src/utils.ts:823` y `models/all/src/index.ts:197`. Evita instalaciones rotas. Esfuerzo: bajo.

**A3. Solo el propietario cambia la activación, validado en servidor.** En Postgres, una política RLS de UPDATE sobre `modulos` condicionada al rol propietario. Respaldo: `foundations/server/packages/middleware/src/pluginConfig.ts:60`. Esfuerzo: bajo.

**A4. Apagar un módulo oculta la interfaz pero conserva los datos.** Gate en el shell React (menú, rutas, acciones) por `enabled`, sin borrar tablas. Respaldo: `models/all/src/index.ts:157-168` (el filtro solo contiene clases de interfaz) y `foundations/core/packages/client-resources/src/index.ts:185-194`. Sirve porque una pyme puede activar y desactivar por prueba sin perder cartera. Hay que decidir si los datos de un módulo apagado salen de las listas globales. Esfuerzo: bajo.

**A5. Manifiesto de módulo explícito con dependencias.** Huly no lo tiene (las dependencias son de paquete, `models/lead/package.json:44-52`) y eso deja sin guarda el caso "apagar un módulo del que otro depende". TailorSuite debería añadir `requiere: [ids]` al registro y bloquear apagar o encender con dependencias sin cumplir. Idea propia, derivada de esa carencia. Esfuerzo: bajo.

**A6. Una aplicación de menú por módulo con navegación declarativa y nivel de acceso mínimo.** Etiqueta, icono, alias, rol mínimo, lista de vistas especiales y de espacios. Respaldo: `models/workbench/src/index.ts:45-55`, `models/lead/src/index.ts:80-143`. El menú se genera desde el registro y respeta el rol. Esfuerzo: medio.

**A7. Ocultar una aplicación por usuario (preferencia personal).** Tabla de preferencias con módulos ocultos. Respaldo: `models/workbench/src/index.ts:63-66`. Útil en equipos donde cada cargo usa dos o tres módulos. Esfuerzo: bajo.

**A8. Extensión de contactos por mixin: "Cliente", "Proveedor", "Empleado" como roles sobre una sola cuenta.** En Postgres: tabla base `cuentas` (persona o empresa) y tablas hijas 1:1 por rol, o una tabla `cuenta_roles`. Respaldo: `models/lead/src/types.ts:92-101` (Customer sobre Contact), `models/hr/src/index.ts:109-114` (Staff sobre Employee), `models/contact/src/index.ts:129`. Resuelve el caso colombiano típico de un tercero que es cliente y proveedor, y alimenta ventas, compras y cartera sin duplicar. Esfuerzo: medio.

**A9. Permisos como catálogo de capacidades por módulo y roles que los agrupan, con efecto "prohibir".** Tabla de permisos (`modulo.accion`), de roles y de rol-permiso, con bandera `prohibir` para vetar. Respaldo: `models/core/src/permissions.ts:20-88`, `models/lead/src/permissions.ts:14-17`, `models/products/src/roles.ts:20-57`. Cada módulo registra sus permisos al instalarse. Esfuerzo: medio.

**A10. Permisos por "espacio" (por embudo, sede o bodega) y no solo globales.** Un rol se asigna a un usuario dentro de un contenedor. Respaldo: `models/core/src/security.ts:60-160` y `foundations/server/packages/middleware/src/spacePermissions.ts:165-230`. En Postgres: tabla `miembros_espacio(espacio, usuario, rol)` y una función auxiliar usada por las políticas RLS. Sirve a pymes con varias sedes o vendedores con carteras separadas. Esfuerzo: medio.

**A11. Plantillas de estados editables (embudo y flujos) con categorías fijas.** Estados con categoría fija (sin empezar, activo, ganado, perdido) y nombre libre; el módulo trae una plantilla por defecto. Respaldo: `models/lead/src/spaceType.ts:24-79`, `models/task/src/index.ts:175-228`. Cada pyme nombra sus etapas sin romper reportes que agrupan por categoría. Esfuerzo: medio.

**A12. Migraciones por módulo con pasos nombrados e idempotentes, y semillas por módulo al activarlo.** Tabla `migraciones_modulo(modulo, paso)`; al encender un módulo por primera vez se corren sus semillas (embudo por defecto, secuencias). Respaldo: `models/lead/src/migration.ts:34-58`, `:194-199` y `foundations/core/packages/model/src/migration.ts:213`. Esfuerzo: bajo a medio.

**A13. Secuencias de numeración por clase con prefijo.** Tabla `secuencias(clase, prefijo, valor)` con incremento atómico (cotización, pedido, factura). Respaldo: `models/core/src/core.ts:420-432`, `models/lead/src/types.ts:70`. Importante para consecutivos legales; en Postgres se resuelve con `UPDATE ... RETURNING` en transacción o con secuencias nativas por serie. Esfuerzo: bajo.

**A14. Registro de integraciones por tipo, separado del módulo.** Tabla `integraciones(tipo, valor cifrado, compartida_con, error)` con catálogo de tipos (correo, WhatsApp, DIAN, pasarela). Respaldo: `models/setting/src/index.ts:62-100`. Mantiene los secretos fuera de las tablas de negocio. Esfuerzo: medio.

**A15. Motor simple de procesos (estado, transición, disparador, acciones, log de ejecución).** Útil como futuro módulo de automatización o aprobaciones (por ejemplo, aprobar una compra mayor a un monto). Respaldo: `models/process/src/index.ts:89-210`, `:224-240`. Para una pyme basta un subconjunto (aprobaciones y avisos). Esfuerzo: alto si se hace completo; medio si solo aprobaciones.

**A16. Orden mínimo útil de módulos, deducido de cómo Huly los activa por defecto.** Núcleo no apagable (contactos, avisos, ajustes), luego lo que Huly enciende de fábrica en negocio (calendario, tareas, RR. HH. básico: `models/all/src/index.ts:191-319`) y lo que deja apagado para activar a pedido (lead, inventario, documentos controlados, formación: `:254-287`, `:418-452`). Para TailorSuite la lectura es: núcleo + CRM (ya existe) + cuentas con roles de cliente y proveedor + catálogo de productos + ventas y facturación + cartera + inventario con existencias; RR. HH. y contabilidad después. Huly no aporta el dominio de ventas, compras ni contable. Esfuerzo: no aplica (decisión de producto).

## No conviene copiar (y por qué)

- **El modelo de objetos propio por transacciones (clases, mixins, `@Model`, `@Prop`) como base de datos.** Es un motor completo (CockroachDB, Elasticsearch, Redpanda, MinIO; ver `ARCHITECTURE_OVERVIEW.md:7-97`) incompatible con Postgres + RLS + Netlify Functions y desproporcionado para una pyme. TailorSuite debe quedarse con tablas relacionales.
- **Arquitectura de 30 servicios y colas** (`ARCHITECTURE_OVERVIEW.md:3-97`). Una instalación por cliente no la justifica.
- **El filtro de modelo en cliente como mecanismo de seguridad.** `returnUITxes` es de interfaz; la protección de datos tiene que estar en RLS. En Huly lo seguro es el middleware de servidor.
- **El módulo `inventory` como base de inventario.** Es solo catálogo con SKU (`models/inventory/src/index.ts:34-77`); sin existencias, costos, bodegas ni movimientos no sirve a un ERP.
- **Los módulos `products`, `controlled-documents`, `training`, `test-management`.** Son gestión de calidad y documentación regulada (`models/products/src/roles.ts:20-57` usa roles QARA y QualifiedUser), fuera del alcance de una pyme comercial.
- **Edición colaborativa con CRDT y oficina virtual** (`collaborator`, `love`): costo alto, valor bajo para TailorSuite.
- **El modelo de Lead como tarea de un tablero (hereda de Task).** Sirve a su producto de proyectos; para ventas formales de una pyme conviene que oportunidad, cotización y pedido sean entidades propias con totales e impuestos.
- **Facturación de Huly (`models/billing`).** Son niveles de almacenamiento del servicio alojado, no facturación a clientes (`models/billing/src/index.ts:28-39`).

## No leído o dudoso

- No se leyó el código de los componentes Svelte de cada módulo ni los `server-plugins/*` más allá de `server-plugins/lead/src/index.ts` y `models/server-lead/src/index.ts` (solo presentadores y coincidencia de notificaciones). Los disparadores de servidor de otros módulos no se revisaron.
- No se encontró una guarda explícita contra apagar un módulo del que otro depende. Puede existir en la interfaz de ajustes (`plugins/setting-resources/src/utils.ts`), que no se leyó entero; el hecho 9 se limita a lo visto en `Configure.svelte` y en `pluginFilterTx`.
- `getPlugins()` (lista de plugins incluidos en el despliegue) se cita en `foundations/core/packages/client-resources/src/index.ts:189`, pero no se abrió dónde se alimenta; cómo se decide qué módulos van en el build del cliente queda sin confirmar.
- El motor de procesos y las tarjetas (Card/MasterTag) se leyeron solo a nivel de modelo; no se verificó cómo se evalúan los disparadores ni cómo se crean los atributos de usuario en tiempo de ejecución.
- Los módulos hr (ausencias, festivos) y recruit se revisaron en su modelo de datos, no en sus reglas de negocio (cálculo de días, aprobación).
- No hay en el repo compras, ventas, facturación, cartera, contabilidad ni nómina; esa parte de la dimensión no está cubierta.
- La licencia exacta del repo se infiere de `models/inventory/package.json` (EPL-2.0) y de las cabeceras; no se abrió `LICENSE` completo.
