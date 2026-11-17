# platform — extensibilidad

Repo leído: Huly Platform (hcengineering/platform), licencia EPL-2.0. Todas las rutas son relativas a la raíz del repo `platform`. Solo se estudian ideas y modelos; no se copia código.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

1. **Todo es un documento con clase; el esquema mismo es un documento.** Cada objeto tiene `_class`, `space`, `modifiedOn`, `modifiedBy` (foundations/core/packages/core/src/classes.ts:108-115). Las clases (`Class`, línea 279), los atributos (`Attribute`, línea 220) y los enums (`Enum`, línea 212) son documentos del mismo sistema, guardados en el dominio `model` (models/core/src/core.ts:213, 235, 241). Por eso crear un campo o un tipo de documento es un `createDoc` más, sin migración de tabla.

2. **Campo personalizado = documento `Attribute` con `isCustom: true`.** El formulario de ajustes arma el atributo con nombre generado (`'custom' + generateId()`), etiqueta, icono, tipo, valor por defecto, `readonly` y `required`, y lo crea en el espacio de modelo (plugins/setting-resources/src/components/CreateAttribute.svelte:66-85). El atributo declara a qué clase pertenece (`attributeOf`), su `type`, `index`, `defaultValue`, `rank` y `required` (classes.ts:220-235).

3. **Catálogo de tipos de campo extensible por mixin.** Los tipos son clases hijas de `Type`: texto, número, booleano, fecha, enum, referencia a documento (`RefTo`), arreglo (`ArrOf`), colección de adjuntos, hipervínculo, markup, rank, identificador secuencial (models/core/src/core.ts:259-348; parámetros en classes.ts:352-413). El selector de tipos de la pantalla de ajustes sale de recorrer los descendientes de `Type` que tengan el mixin `ObjectEditor` (CreateAttribute.svelte:90-96), de modo que registrar un tipo nuevo basta para que aparezca como opción.

4. **Listas de opciones (enum) son entidades reutilizables.** `Enum` guarda `name` y `enumValues`; un atributo usa `EnumOf` apuntando al `Enum` (classes.ts:212-215, 405-407). Se crean desde ajustes (plugins/setting-resources/src/components/EditEnum.svelte:55). Una lista se comparte entre varios campos.

5. **Objetos/tipos de documento personalizados (módulo "Cards").** `MasterTag` es una clase creada en tiempo de ejecución que extiende `Card`; `Tag` es un mixin que se superpone a una tarjeta (plugins/card/src/index.ts:38-46). Crear un tipo es crear un documento `Class` con `kind: CLASS` (tipo maestro) o `kind: MIXIN` (etiqueta), con icono y color derivado del nombre (plugins/card-resources/src/components/CreateTag.svelte:32-43). El tipo hereda de otro tipo (`extends`), por lo que hay jerarquía de tipos definida por el usuario. Una tarjeta trae título, contenido, padre, rank y versión (plugins/card/src/index.ts:58-73).

6. **Tipos de sistema y tipos de usuario comparten el mismo mecanismo.** `createSystemType` crea el `MasterTag` en código y marca `setting.mixin.Editable` con `value: false` para que ajustes no lo deje editar (models/card/src/index.ts:331-355). El tipo de usuario carece de ese bloqueo.

7. **Tipos con campos propios en proyectos/tareas: la clase "mixin objetivo".** Un `TaskType` declara `ofClass` (clase base) y `targetClass` (mixin que aloja los campos definidos por el usuario) (plugins/task/src/index.ts:113-135). Al crear un tipo de tarea, la interfaz crea un `Class` de tipo MIXIN que extiende la clase base y lo guarda como `targetClass` (plugins/task-resources/src/components/taskTypes/CreateTaskType.svelte:138-146). Lo mismo para el proyecto: `ProjectType` extiende `SpaceType` y lleva su propio `targetClass` y la lista de tipos de tarea y estados (plugins/task/src/index.ts:156-173; foundations/core/packages/core/src/classes.ts:541-549).

8. **Estados por tipo de tarea, creados como documentos.** Cada tipo de tarea tiene `statuses`, `statusClass` y `statusCategories` (plugins/task/src/index.ts:113-135); al crearlo se generan estados desde las categorías por defecto y se agregan al proyecto con `$push` (CreateTaskType.svelte:117-135). El flujo (columnas del kanban) es por tipo, no global.

9. **Relaciones entre objetos definidas por el usuario.** `Association` une dos clases con nombre de cada lado y cardinalidad `1:1`, `1:N` o `N:N`; `Relation` es la fila que une dos documentos (classes.ts:136-152). Se crean desde ajustes (plugins/setting-resources/src/components/CreateRelation.svelte:95-110).

10. **Motor de vistas declarativo: `ViewletDescriptor` + `Viewlet`.** El descriptor es el tipo de vista (tabla, lista, árbol, maestro-detalle, documento, kanban, calendario) y apunta a un componente (plugins/view/src/types.ts:338-341; models/view/src/index.ts:642-700; kanban en models/task/src/index.ts:330-337; calendario en models/calendar/src/index.ts:325-332). El `Viewlet` liga una clase (`attachTo`) con un descriptor, una consulta base, columnas (`config`), opciones de agrupar/ordenar (`viewOptions`) y propiedades (plugins/view/src/types.ts:455-466). Una vista de usuario es un `Viewlet` creado en el espacio de modelo, como en el editor de vistas por tipo de tarjeta (plugins/card-resources/src/components/settings/view/CreateView.svelte:54-84).

11. **Los campos personalizados entran solos a agrupar y ordenar.** Al abrir las opciones de vista, el botón recorre los atributos propios de la clase con `isCustom`, y añade los de tipo `RefTo`/`EnumOf` como criterios de agrupación y los de tipo enum, texto, número, fecha y booleano como criterios de orden (plugins/card-resources/src/components/settings/view/ViewOptionsButton.svelte:34-80).

12. **Filtros guardados por usuario, con opción de compartir.** `FilteredView` guarda nombre, ubicación, los filtros serializados como JSON (`filters: string`), las opciones de vista, la vista activa, `sharable` y la lista de `users` dueños (plugins/view/src/types.ts:110-121). Vive en un dominio propio `view`, distinto del modelo (models/view/src/index.ts:120-136). Se guarda con el uuid del usuario actual (plugins/view-resources/src/components/filter/FilterSave.svelte:30-41) y está bloqueado para invitados de solo lectura (plugins/view-resources/src/components/filter/FilterBar.svelte:46).

13. **Motor de filtros por tipo de campo.** Cada clase de tipo registra un componente de filtro con el mixin `AttributeFilter` (models/view/src/index.ts:1084-1126). Los modos (es uno de, no es, antes, después, hoy, semana, contiene, rango, anidado) son documentos `FilterMode` con una función que traduce a operadores de consulta (`$in`, `$nin`, `$gte`, `$lte`, `$like`, `$all`) (plugins/view-resources/src/filter.ts:51-100, 103-175; documento del modo en plugins/view/src/types.ts:81-87). Un campo nuevo hereda los filtros de su tipo sin código.

14. **Preferencias de vista por usuario.** `ViewletPreference` (plugins/view/src/types.ts:738-741) guarda las columnas elegidas por cada usuario para un viewlet; las pantallas lo consultan y, si existe, lo usan en lugar de las columnas del viewlet (plugins/card-resources/src/components/Childs.svelte:60-92). Las opciones de agrupar/ordenar, en cambio, se guardan en `localStorage` del navegador, con clave por viewlet y ruta (plugins/view-resources/src/viewOptions.ts:45-59).

15. **Cómo se persiste la metadata.** El servidor arma el modelo concatenando las transacciones del sistema (código) con las del usuario leídas de la base (`getUserTx`), las reaplica a la jerarquía al arrancar y calcula un hash encadenado del modelo (foundations/server/packages/middleware/src/model.ts:84-121). Cada cambio de modelo en caliente se aplica a la jerarquía, se añade al hash y se propaga (model.ts:168-178). Un cliente con el mismo hash no descarga nada (model.ts:148-157).

16. **Dónde caen los valores de los campos.** Cada dominio es una tabla con columnas fijas para los campos base y una columna `data JSONB` con el resto (foundations/server/packages/postgres/src/utils.ts:155-175; columnas base en foundations/server/packages/postgres/src/schemas.ts:21-60). Un campo personalizado no crea columna: va al JSON. Por eso el indexador de dominio ignora los índices de atributos personalizados (foundations/server/packages/core/src/domainHelper.ts:46-50).

17. **Permisos por tipo.** El `MasterTag` lleva `roles` (colección de `Role`) con `types` (plugins/card/src/index.ts:38-50); `SpaceType` y `Role` definen permisos por espacio (classes.ts:541-558). A nivel de servidor, solo el dominio de configuración está protegido para el rol dueño (foundations/server/packages/middleware/src/configuration.ts:34, 55-66).

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| Doc (base) | `_id`, `_class`, `space`, `modifiedOn/By`, `createdOn/By` | pertenece a un `Space` | foundations/core/packages/core/src/classes.ts:108 |
| Class | `extends`, `kind` (clase, interfaz, mixin), `domain`, `label`, `icon` | hereda de otra clase | classes.ts:279; models/core/src/core.ts:213 |
| Attribute | `attributeOf`, `name`, `type`, `isCustom`, `defaultValue`, `required`, `rank`, `index`, `readonly` | `attributeOf` apunta a Class; `type` es un Type embebido | classes.ts:220 |
| Type (hijos) | según tipo: `of`, `to`, `min`, `max`, `digits`, `mode` | `RefTo.to` clase; `EnumOf.of` enum | classes.ts:352-413 |
| Enum | `name`, `enumValues[]` | usado por `EnumOf` | classes.ts:212 |
| MasterTag / Tag | `extends`, `roles`, `background`, `baseType` | clase que extiende Card; Tag es mixin | plugins/card/src/index.ts:38-46 |
| Card | `title`, `content`, `parent`, `parentInfo`, `rank`, `blobs` | `_class` es un MasterTag | plugins/card/src/index.ts:58 |
| Association / Relation | `classA`, `classB`, `nameA`, `nameB`, `type` / `docA`, `docB`, `association` | relación N:N entre dos instancias | classes.ts:136-152 |
| SpaceType (ProjectType) | `descriptor`, `targetClass`, `roles`, `tasks`, `statuses` | agrupa TaskType; define mixin de campos del espacio | classes.ts:541; plugins/task/src/index.ts:156 |
| TaskType | `parent`, `ofClass`, `targetClass`, `statuses`, `statusCategories`, `kind` | pertenece a ProjectType; sus estados son documentos | plugins/task/src/index.ts:113 |
| ViewletDescriptor | `component`, `label`, `icon` | referido por Viewlet | plugins/view/src/types.ts:338 |
| Viewlet | `attachTo`, `descriptor`, `baseQuery`, `config`, `viewOptions`, `variant` | clase y descriptor | plugins/view/src/types.ts:455 |
| ViewletPreference | `attachedTo` (viewlet), `config` | una por usuario y viewlet | plugins/view/src/types.ts:738 |
| FilteredView | `name`, `location`, `filters` (JSON), `viewOptions`, `viewletId`, `sharable`, `users` | dominio `view` | plugins/view/src/types.ts:110; models/view/src/index.ts:120 |
| FilterMode | `label`, `result` (función) | usado por Filter | plugins/view/src/types.ts:81 |

## Decisiones de diseño que se notan y su porqué

- **El esquema es dato, no migración.** Crear campos, tipos y vistas son inserciones en el modelo, y los clientes reciben el cambio en vivo. Beneficio: personalizar no requiere desplegar. Costo: el motor tiene que interpretar todo en tiempo de ejecución (hechos 1, 15).
- **Los valores personalizados viven en JSONB, no en columnas.** Se evita el DDL dinámico y el riesgo de bloqueos de tabla, a cambio de no poder indexar campos personalizados con el mecanismo de atributos (hecho 16).
- **Mixins para campos por tipo de tarea o de espacio.** En vez de una tabla de valores por campo, la clase mixin del tipo aloja sus atributos y se aplica sobre el mismo documento. Así un tipo de tarea tiene campos distintos de otro sin tablas separadas (hecho 7).
- **Cada tipo de campo trae su editor, su presentador y su filtro como mixins.** Añadir un tipo es registrar componentes, y toda la interfaz (formularios, listas, filtros, orden) lo recoge (hechos 3, 13).
- **Vista (qué se muestra) separada de preferencia (cómo lo ve cada quien).** Viewlet global en el modelo; columnas por usuario en `ViewletPreference`; filtros por usuario y compartibles en `FilteredView`; agrupar/ordenar en el navegador. Cada capa con su alcance (hechos 10, 12, 14).
- **Los filtros se guardan como JSON, no como consulta.** Se reconstruyen al abrir la vista y se traducen a operadores de consulta con funciones registradas; así sobreviven a cambios del esquema mientras la clave del campo exista (hechos 12, 13).
- **Tipos de sistema y de usuario con el mismo molde.** Facilita que lo que hoy es del usuario mañana se promueva a sistema (hecho 6).

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Definición de campos personalizados como filas de metadata, valores en una columna `jsonb` por tabla.** Una tabla `campo_def` (entidad destino, clave, etiqueta, tipo, requerido, valor por defecto, orden, opciones) y una columna `extra jsonb` en cada tabla que admita campos. Cita: classes.ts:220-235; CreateAttribute.svelte:66-85; foundations/server/packages/postgres/src/utils.ts:155-175. Sirve porque cada instalación del cliente adapta su CRM y sus documentos sin que nadie programe; TailorSuite ya hace algo parecido en el CRM y esto lo generaliza a todos los módulos. Esfuerzo: medio (la validación de tipo y la regla de RLS por tabla ya existen; falta el generador de formularios y el contrato común).

**A2. Catálogo cerrado y extensible de tipos de campo, con un registro de componentes por tipo (editor, presentador, filtro).** Un mapa `tipo -> {editor, celda, filtro, validador}` en el shell. Cita: CreateAttribute.svelte:90-96; models/view/src/index.ts:1084-1126. Sirve porque agregar un tipo (por ejemplo "NIT con dígito de verificación" o "moneda") no obliga a tocar formularios, listas y filtros; una pyme latinoamericana necesita tipos locales. Esfuerzo: medio.

**A3. Listas de opciones compartidas (enum) como entidad propia.** Tabla `lista_opciones` con valores, que varios campos referencian. Cita: classes.ts:212-215, 405-407; EditEnum.svelte:55. Sirve porque ciudades, motivos de pérdida, formas de pago o categorías se editan en un solo sitio y alimentan campos, filtros y agrupaciones. Esfuerzo: bajo.

**A4. Que los campos personalizados entren automáticamente a filtros, agrupación y orden.** La lista de criterios se calcula leyendo la metadata, no se escribe a mano por vista. Cita: plugins/card-resources/src/components/settings/view/ViewOptionsButton.svelte:34-80; plugins/view-resources/src/filter.ts:51-100. Sirve porque quien instala crea un campo "zona de venta" y ya puede filtrar y agrupar la cartera por él, sin ayuda. Esfuerzo: medio (hay que traducir a consultas sobre `jsonb`, con casteo por tipo).

**A5. Vista guardada como documento con tres alcances.** Vista de instalación (columnas por defecto), preferencia del usuario (columnas propias) y filtro guardado del usuario, opcionalmente compartido con la lista de usuarios. Cita: plugins/view/src/types.ts:110-121, 455-466, 738-741; FilterSave.svelte:30-41. Sirve porque cada vendedor o contador arma sus listas sin pisar las del resto, y el administrador deja listas oficiales. En Postgres encaja con RLS: dueño del registro o vista marcada como compartida. Esfuerzo: medio.

**A6. Filtros guardados como JSON de condiciones por campo, no como SQL.** Formato `{campo, modo, valores}` que el servidor traduce con una lista blanca de operadores. Cita: plugins/view/src/types.ts:96-107; plugins/view-resources/src/filter.ts:51-100. Sirve porque se evita inyección, se puede validar contra la metadata y las vistas sobreviven a renombres controlados. Esfuerzo: bajo a medio.

**A7. Modos de filtro de fecha con nombre (hoy, esta semana, este mes, vencido, sin fecha, personalizado).** Cita: plugins/view-resources/src/filter.ts:103-175. Sirve de inmediato para cartera (vencidas, por vencer), compras y tareas de RR. HH.; son los filtros que más usa una pyme. Esfuerzo: bajo.

**A8. Descriptor de vista como registro de componentes: tabla, lista, kanban, calendario, formulario.** Una tabla de vistas con `entidad`, `tipo_vista`, `config` (columnas, agrupar por, orden, consulta base) y un registro que mapea tipo de vista a componente React. Cita: plugins/view/src/types.ts:338-341, 455-466; models/view/src/index.ts:642-700. Sirve porque un solo motor muestra oportunidades, pedidos, tareas y facturas como tabla o tablero, sin duplicar pantallas por módulo. Esfuerzo: alto (es la pieza grande; se puede entregar por fases: tabla y kanban primero).

**A9. Kanban cuyo eje es un campo de estado definido por tipo de registro.** Estados como filas con categoría (pendiente, en curso, terminado, cancelado), ordenados, atados a un tipo de registro. Cita: plugins/task/src/index.ts:113-135; CreateTaskType.svelte:117-135. Sirve porque el embudo de ventas de un taller no es el de una clínica, pero el motor de cartera necesita saber qué estado cuenta como "cerrado"; las categorías dan ese significado fijo. Esfuerzo: medio.

**A10. Tipos de registro definidos por el instalador, con campos y estados propios, sobre una tabla genérica.** Un "tipo de documento" (por ejemplo "Orden de trabajo", "Cotización especial") con su lista de campos, estados y permisos, almacenado en una tabla común `registro` con `tipo_id`, `datos jsonb`. Cita: plugins/card/src/index.ts:38-73; CreateTag.svelte:32-43. Sirve para cubrir necesidades menores sin crear un módulo; no sustituye a los módulos con lógica contable. Esfuerzo: alto. Recomendado limitarlo a registros sin impacto contable.

**A11. Herencia ligera de tipos (tipo hijo agrega campos al padre).** Cita: plugins/card/src/index.ts:38-46 (`extends`); CreateTag.svelte:32-37. Sirve para "Cuenta" a "Cuenta persona" / "Cuenta empresa" con campos comunes y propios, cosa que el CRM de TailorSuite ya distingue. Esfuerzo: medio; opcional.

**A12. Relaciones definidas por el usuario entre tipos de registro (1:1, 1:N, N:N) en tabla puente genérica.** Cita: classes.ts:136-152; CreateRelation.svelte:95-110. Sirve para vincular, por ejemplo, equipos con clientes o contratos con licitaciones sin migración. Esfuerzo: medio.

**A13. Hash/versión del modelo de metadata y descarga incremental en el cliente.** El shell compara una versión de la configuración y solo recarga cuando cambia. Cita: foundations/server/packages/middleware/src/model.ts:84-121, 148-157. Sirve porque la metadata se consulta en cada pantalla; con una columna de versión por instalación se cachea en el navegador. Esfuerzo: bajo.

**A14. Bloqueo de edición de lo que define el sistema.** Marca `editable: false` para campos y tipos que trae el producto, y los de usuario sí se pueden editar o borrar. Cita: models/card/src/index.ts:331-355 (mixin `Editable` en falso); CreateAttribute.svelte:72 (`isCustom`). Sirve para que el instalador no rompa campos que el código de facturación o cartera necesita. Esfuerzo: bajo.

## No conviene copiar (y por qué)

- **El modelo "todo es documento con clase y mixins" y el motor de transacciones.** Es una plataforma propia (jerarquía de clases en memoria, mixins dinámicos, transacciones de modelo). Para una pyme sobre Postgres con RLS es mucha más complejidad que una tabla de metadata; con A1 a A5 se obtiene la mayor parte del valor.
- **Valores solo en `jsonb` sin columnas reales para los módulos transaccionales.** Huly lo hace para todo, y no tiene contabilidad. Facturas, inventario y asientos necesitan columnas tipadas, claves foráneas y restricciones; los campos personalizados deben quedar como extensión, no como base.
- **Componentes de editor, presentador y filtro registrados por cadena en un mixin de cada tipo.** Es una mecánica de plugins de Svelte; en React basta un objeto `tipo -> componentes`.
- **Opciones de agrupar/ordenar guardadas en `localStorage`.** Se pierden al cambiar de equipo o navegador (plugins/view-resources/src/viewOptions.ts:45-59). TailorSuite debería guardarlas en servidor dentro de la preferencia del usuario.
- **Crear clases y atributos desde el cliente con permiso amplio sobre el espacio de modelo.** La protección en servidor que se vio cubre solo el dominio de configuración (configuration.ts:34, 55-66); para TailorSuite la creación de metadata debe quedar tras un permiso explícito y auditado.
- **Atributos sin índice posible.** El indexador omite los personalizados (foundations/server/packages/core/src/domainHelper.ts:46-50). En Postgres se puede hacer mejor con índices GIN o por expresión en los campos que más se filtran.
- **Stack completo (CockroachDB, Elasticsearch, Redpanda, microservicios).** Fuera de escala para una instalación por cliente (ARCHITECTURE_OVERVIEW.md:1-100).

## No leído o dudoso

- **Quién puede modificar el modelo.** Vi el control del dominio de configuración (foundations/server/packages/middleware/src/configuration.ts:55-66) y la lista de espacios principales (spaceSecurity.ts:77-84), pero no confirmé la regla de servidor que impide que un usuario sin rol alto cree `Attribute` o `Class` en `core.space.Model`. Puede estar en permisos de espacio o en el rol de cuenta; no lo rastreé hasta el final.
- **Calendario como vista de tipos propios.** Confirmé el descriptor del calendario (models/calendar/src/index.ts:325-332) pero solo como vista de eventos; no verifiqué si un tipo de tarjeta personalizado puede mostrarse en calendario por una fecha elegida.
- **Validación de campos obligatorios y de valores por defecto al guardar.** El atributo trae `required` y `defaultValue` (classes.ts:220-235), pero no leí dónde se hacen cumplir en cliente o servidor.
- **Formularios por tipo (orden y secciones de los campos).** Vi `rank` en el atributo y secciones de tarjeta (plugins/card/src/index.ts:85-103), no el editor de orden de campos.
- **Automatización asociada a campos (`process`, `automationOnly`).** Solo vi las banderas en el atributo; el motor de procesos no se leyó.
- **Migración al cambiar el tipo de un campo con datos existentes.** No lo encontré tratado.
- **Plantillas de proyecto/tablero (`templates`, `kanban template`).** No se leyó el flujo de plantillas.
- **Importación y exportación de tipos personalizados.** Existe `ExportExtension` (plugins/card/src/index.ts:132-139) y un importador (packages/importer/src/huly/cards.ts), sin leer.
