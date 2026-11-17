# twenty — extensibilidad

Repo leído: `twenty` (monorepo, AGPLv3 con dos excepciones: archivos marcados `/* @license Enterprise */` bajo licencia comercial y paquetes MIT como twenty-sdk, twenty-shared y twenty-apps; ver `LICENSE:3-6`). Todas las rutas son relativas a la raíz del repo. Se estudiaron ideas y modelos; nada de código se copia.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

**H1. Objetos y campos son filas de metadata, y cada cambio altera de verdad el esquema Postgres.** Existen las entidades `objectMetadata` y `fieldMetadata`. Al crear un campo, el ejecutor de migraciones inserta la fila de metadata y, en el mismo flujo, crea los enums de Postgres, añade las columnas a la tabla del objeto dentro del esquema de ese espacio de trabajo y, si es una relación muchos-a-uno, la llave foránea. Un campo personalizado es una columna real, no un JSON genérico.
- `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:52-100`
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/field/services/create-field-action-handler.service.ts:109-119` (inserta la metadata) y `:245-286` (enums, `addColumns` sobre la tabla, llave foránea)
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/get-workspace-schema-context-for-migration.util.ts:11-25` (esquema por espacio de trabajo + tabla del objeto)

**H2. Catálogo cerrado de tipos de campo, con mapeo fijo a tipo de columna.** 25 tipos (TEXT, NUMBER, NUMERIC, CURRENCY, DATE, DATE_TIME, SELECT, MULTI_SELECT, RATING, RELATION, MORPH_RELATION, EMAILS, PHONES, LINKS, ADDRESS, FULL_NAME, ACTOR, FILES, RICH_TEXT, ARRAY, RAW_JSON, BOOLEAN, UUID, POSITION, TS_VECTOR). Los escalares van a `text`, `uuid`, `numeric`, `float`, `boolean`, `timestamptz`, `date`, `jsonb`, `tsvector` o enum nativo; los compuestos no tienen tipo de columna propio.
- `packages/twenty-shared/src/types/FieldMetadataType.ts:1-27`
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/field-metadata-type-to-column-type.util.ts:9-47`

**H3. Los tipos compuestos se aplanan en varias columnas.** Una moneda se declara como una lista de propiedades (importe en micros de tipo NUMERIC y código de moneda de tipo TEXT); el generador de columnas crea una columna por propiedad con nombre derivado del campo padre (`computeCompositeColumnName`) y reparte el valor por defecto entre ellas. Existen definiciones análogas para dirección, correos, teléfonos, enlaces, nombre completo, actor y texto enriquecido.
- `packages/twenty-shared/src/types/composite-types/currency.composite-type.ts:4-20`
- `packages/twenty-shared/src/types/composite-types/composite-type.interface.ts:29-46`
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/generate-column-definitions.util.ts:33-80`

**H4. La configuración fina de cada campo va en columnas `jsonb` tipadas por tipo de campo.** `settings` (por ejemplo decimales y variante porcentaje en NUMBER, formato en CURRENCY, tipo de relación y `onDelete` en RELATION, máximo de archivos en FILES), `options` (lista de opciones de SELECT) y `defaultValue`. El contrato TypeScript asocia cada tipo con su forma de `settings`.
- `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:104-105,129-134`
- `packages/twenty-shared/src/types/FieldMetadataSettings.ts:73-100`
- `packages/twenty-shared/src/types/RelationOnDeleteAction.ts:1-5` (CASCADE, RESTRICT, SET_NULL, NO_ACTION) y `RelationType.ts:1-4`

**H5. Las opciones de SELECT se están moviendo a una tabla propia con valor estable y etiqueta editable.** La tabla `fieldMetadataOption` guarda `value` (la etiqueta del enum de Postgres, nunca sobrescribible porque identifica los registros guardados), `label`, `color` y `position`; la unicidad de `(campo, valor)` es diferida para poder intercambiar valores dentro de una misma migración. Una opción puede quedar inactiva: sigue en los registros viejos pero no se puede elegir. El comentario de la columna `options` indica que se retirará cuando una versión posterior haya corrido en todos los espacios.
- `packages/twenty-server/src/engine/metadata-modules/field-metadata-option/entities/field-metadata-option.entity.ts:26-67`
- `packages/twenty-shared/src/types/FieldMetadataOptions.ts:5-18`
- `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:129`

**H6. Restricciones de integridad de la propia metadata.** Nombre de campo único por objeto; nombres singular y plural de objeto únicos; un campo MORPH_RELATION exige `morphId`. Un campo marca `isActive`, `isSystem`, `isUIEditable`, `isNullable`, `isAuditLogged` y `writability` (OPEN, APPLICATION, SYSTEM); `isUnique` no se guarda en el campo: se deriva de un índice único de un solo campo.
- `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:54-72,143-170,183-198`
- `packages/twenty-server/src/engine/metadata-modules/object-metadata/object-metadata.entity.ts:50-57`
- `packages/twenty-shared/src/types/MetadataWritability.ts:1-5`

**H7. Qué se puede editar depende de si el campo es propio o estándar.** Una lista fija de propiedades editables para campos personalizados (incluye nombre, etiqueta, opciones, ajustes, defecto, unicidad, búsqueda) y otra más corta para estándar (sin nombre). Los objetos y campos estándar admiten un `overrides` jsonb para cambiar apariencia sin tocar la definición base.
- `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts:3-29`
- `packages/twenty-server/src/engine/metadata-modules/object-metadata/object-metadata.entity.ts:100-104`
- `packages/twenty-server/src/engine/workspace-manager/types/overridable-entity.type.ts:7-15`

**H8. Todo objeto nuevo nace con un paquete base de campos y relaciones.** Un objeto personalizado trae `id`, `createdAt`, `updatedAt`, `deletedAt` (borrado lógico), `name`, `position`, `createdBy` y `updatedBy` (compuesto actor con origen MANUAL, API, IMPORT, WORKFLOW…) y un vector de búsqueda. Además, al crearlo se generan automáticamente relaciones polimórficas hacia línea de tiempo, adjuntos, notas y tareas, de modo que cualquier objeto nuevo admite actividades.
- `packages/twenty-server/src/engine/twenty-orm/custom.workspace-entity.ts:17-27`
- `packages/twenty-server/src/engine/twenty-orm/base.workspace-entity.ts:1-6`
- `packages/twenty-shared/src/metadata/constants/default-relations-object-standard-ids.constant.ts:3-8`
- `packages/twenty-server/src/engine/metadata-modules/object-metadata/utils/build-system-relation-flat-field-metadatas-for-object.util.ts:62-80`
- `packages/twenty-shared/src/types/composite-types/actor.composite-type.ts:8-19`

**H9. La API GraphQL del espacio de trabajo se genera desde la metadata.** El esquema SDL y los resolvers se calculan a partir de los mapas de objetos, campos e índices; no hay código por objeto.
- `packages/twenty-server/src/engine/api/graphql/workspace-schema.factory.ts:22-70`

**H10. La vista es una entidad rica, no un par filtro+columnas.** `view` pertenece a un objeto y tiene tipo (TABLE, KANBAN, CALENDAR, LIST y variantes WIDGET para incrustar), clave (`INDEX` marca la vista por defecto del objeto), icono, posición, modo compacto, filtro de «cualquier campo», campo de agrupación principal, ocultar grupos vacíos, mostrar grupos como pestañas y límite de carga por grupo. Kanban lleva operación de agregado sobre un campo; calendario lleva campo de fecha, campo de fecha final opcional y disposición (DAY, WEEK, MONTH). Un CHECK de base de datos impone que un calendario siempre tenga disposición y campo de fecha.
- `packages/twenty-server/src/engine/metadata-modules/view/entities/view.entity.ts:72-90,110-124,151-251`
- `packages/twenty-shared/src/types/ViewType.ts:1-11`, `ViewKey.ts:1-3`, `ViewCalendarLayout.ts:1-5`, `AggregateOperations.ts:1-17`

**H11. Una vista se compone de hijos normalizados en tablas separadas.** Campos visibles (`viewField`: visibilidad, ancho, posición, agregado por columna, y una referencia a un campo de la relación destino para mostrar columnas de un registro vinculado); filtros (`viewFilter`: campo, operando, valor jsonb, subcampo); grupos de filtros anidados con operador AND, OR o NOT y padre propio; ordenamientos (campo, dirección, subcampo); grupos (`viewGroup`: valor, posición, visibilidad, que son las columnas del kanban); y grupos de campos (`viewFieldGroup`, secciones con nombre en páginas de registro).
- `packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts:55-100`
- `packages/twenty-server/src/engine/metadata-modules/view-filter/entities/view-filter.entity.ts:48-66`
- `packages/twenty-server/src/engine/metadata-modules/view-filter-group/entities/view-filter-group.entity.ts:24-37,70`
- `packages/twenty-shared/src/types/ViewFilterGroupLogicalOperator.ts:1-5`
- `packages/twenty-server/src/engine/metadata-modules/view-sort/entities/view-sort.entity.ts:31-50`
- `packages/twenty-server/src/engine/metadata-modules/view-group/entities/view-group.entity.ts:29-35`

**H12. Las vistas personales y las compartidas se distinguen con un solo atributo.** `visibility` es WORKSPACE (visible a todos) o UNLISTED (solo para quien la creó, guardado en `createdByUserWorkspaceId`). Regla de acceso: una vista no listada solo se ve si el usuario es su autor; editar o publicar vistas de espacio de trabajo exige el permiso `VIEWS`, pero cualquiera puede crear y editar sus propias vistas no listadas. La interfaz repite la regla: sin permiso VIEWS solo se persisten cambios sobre vistas no listadas.
- `packages/twenty-server/src/engine/metadata-modules/view/entities/view.entity.ts:271,280`
- `packages/twenty-server/src/engine/metadata-modules/view/utils/is-view-visible-to-user.util.ts:4-20`
- `packages/twenty-server/src/engine/permissions/metadata-permissions/services/view-access.service.ts:65-89,138-163`
- `packages/twenty-front/src/modules/views/hooks/useCanPersistViewChanges.ts:8-25`

**H13. El filtro guardado y el filtro aplicado usan el mismo compilador, y los operandos válidos dependen del tipo de campo.** Una tabla fija asocia cada tipo filtrable con sus operandos (texto: contiene, no contiene, es, no es, vacío, no vacío; moneda: mayor o igual, menor o igual, vacío; relación: es, no es). El compilador de `twenty-shared` convierte los filtros y grupos de filtros en el filtro GraphQL del espacio de trabajo y se usa tanto en el frente como en el servidor. El validador del servidor rechaza al guardar un operando incompatible con el tipo del campo.
- `packages/twenty-shared/src/utils/filter/utils/filterOperandsMap.ts:6-60`
- `packages/twenty-shared/src/utils/filter/utils/getFilterOperandsForFilterableFieldType.ts:16-39`
- `packages/twenty-shared/src/utils/filter/computeRecordGqlOperationFilter.ts:16-60`
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/utils/get-incompatible-view-filter-operand-error.util.ts:11-43`
- `packages/twenty-shared/src/types/ViewFilterOperand.ts:1-17` (incluye operandos de fecha relativa: es relativo, hoy, en el pasado, en el futuro)

**H14. El kanban solo agrupa por un campo SELECT o por una relación muchos-a-uno.** Regla validada en el servidor al guardar la vista. Cada columna del tablero es una fila `viewGroup`, así que el orden y la visibilidad de las columnas se guardan.
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/utils/is-allowed-flat-view-kanban-main-group-by-field.util.ts:6-24`
- `packages/twenty-apps/internal/real-estate/src/views/buyer-pipeline.view.ts:28-59`

**H15. Desactivar un campo limpia sus vistas por cascada; el campo identificador no se puede desactivar.** Al desactivar un campo se borran los filtros, columnas (incluidas las columnas de relación que apuntan a él) y se afectan las vistas que lo usaban como agrupación. Esto evita vistas rotas sin intervención manual.
- `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/handle-field-metadata-deactivation-side-effects.util.ts:31-70`
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-field-metadata-validator.service.ts:170`

**H16. Reglas de validación de datos sin código, por expresión.** Entidad `validationRule` por objeto: expresión de texto, enlaces compilados a campos (`bindings`), mensaje de error y campo al que se asocia el error. La expresión se compila contra los campos reales del objeto al guardar; una expresión inválida se rechaza antes de activarse. El archivo de compilación del servidor está marcado como Enterprise (licencia comercial), por lo que sirve solo como idea.
- `packages/twenty-server/src/engine/metadata-modules/validation-rule/entities/validation-rule.entity.ts:32-72`
- `packages/twenty-server/src/engine/metadata-modules/validation-rule/utils/compile-validation-rule-expression-or-throw.util.ts:1,15-43`
- `packages/twenty-shared/src/utils/validation-rule/compileValidationRuleExpression.ts:14-55`

**H17. Formularios de creación derivados de la metadata.** Existe un tipo de página `RECORD_FORM` («Creation Form»). Al crear un objeto se genera el cascarón con una pestaña «Fields»; al crear un campo se añade un widget `FORM_FIELD` en ella. Los tipos sin entrada de formulario (ACTOR, NUMERIC, POSITION, RATING, TS_VECTOR y relaciones que no sean muchos-a-uno) quedan fuera. El formulario es un layout, no una vista.
- `packages/twenty-shared/src/types/page-layout/PageLayoutType.ts:1-7`
- `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-record-form-widget-on-create-side-effect-handler.service.ts:29`
- `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/object-metadata/services/object-record-form-on-create-side-effect-handler.service.ts:17`

**H18. La página de detalle del registro es un layout de pestañas y widgets guardado en metadata.** `pageLayout` (tipo RECORD_INDEX, RECORD_PAGE, DASHBOARD, STANDALONE_PAGE, RECORD_FORM) → `pageLayoutTab` (título, posición, modo GRID, VERTICAL_LIST o CANVAS) → `pageLayoutWidget` (tipo, posición y configuración en jsonb). Hay widgets de campos, de vista incrustada (lista de registros relacionados), de línea de tiempo, tareas, notas, archivos, gráficos, iframe y componentes del frente.
- `packages/twenty-server/src/engine/metadata-modules/page-layout/entities/page-layout.entity.ts:36-56`
- `packages/twenty-server/src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity.ts:44-76`
- `packages/twenty-server/src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity.ts:80,102-105`
- `packages/twenty-shared/src/types/page-layout/WidgetType.ts:1-35`, `PageLayoutTabLayoutMode.ts:1-4`

**H19. Los módulos de terceros se declaran como código y se sincronizan a la metadata.** Una «aplicación» (`defineApplication`) agrupa objetos (`defineObject`), campos sobre objetos ajenos (`defineField`, p. ej. añadir «tipo de persona» a Persona), vistas con sus columnas, filtros y grupos (`defineView`), layouts de página, roles y menús de navegación, cada uno con un UUID estable (`universalIdentifier`). El instalador convierte el manifiesto en entidades planas y las aplica como migración. Todas las entidades sincronizables llevan `universalIdentifier` y `applicationId`, único por espacio de trabajo; desinstalar la aplicación borra en cascada lo suyo.
- `packages/twenty-apps/internal/real-estate/src/application.config.ts:6-11`
- `packages/twenty-apps/internal/real-estate/src/objects/property.object.ts:27-60`
- `packages/twenty-apps/internal/real-estate/src/fields/person-type.field.ts:16-26`
- `packages/twenty-sdk/src/sdk/define/objects/define-object.ts:8-31` (validación previa del manifiesto)
- `packages/twenty-server/src/engine/workspace-manager/types/syncable-entity.interface.ts:6-22`
- `packages/twenty-server/src/engine/core-modules/application/application-manifest/application-sync.service.ts:67,350`

**H20. Los cambios de metadata pasan por un pipeline validar, construir, ejecutar.** El orquestador recibe un conjunto de operaciones, valida cada entidad con un validador específico (campo, objeto, vista, filtro, índice, widget…), calcula acciones ordenadas, las ejecuta sobre metadata y esquema mediante un `queryRunner` y admite simulación (`dryRun`). Las operaciones con efectos laterales (crear objeto genera su vista INDEX, su formulario, relaciones del sistema) se expanden en el motor, no en el cliente.
- `packages/twenty-server/src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service.ts:101-172`
- `packages/twenty-server/src/engine/metadata-modules/view/constants/initial-object-view-defaults.constant.ts:4-8` (vista inicial TABLE en posición 1)
- `packages/twenty-server/src/engine/metadata-modules/flat-object-metadata/utils/from-create-object-input-to-flat-object-metadata-and-flat-field-metadatas-to-create.util.ts:22-115`

**H21. Permisos sobre objetos y campos también son metadata, y los permisos por fila reutilizan el modelo de filtro.** Por rol y objeto: leer, crear, actualizar, borrado lógico, destruir. Por rol y campo: permiso propio. Un predicado de permiso por fila tiene campo, operando y valor, y puede compararse con un campo del miembro actual (por ejemplo «el responsable es quien consulta»).
- `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts:53-68`
- `packages/twenty-server/src/engine/metadata-modules/object-permission/field-permission/field-permission.entity.ts:50-54`
- `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts:99,108`

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

Esquema `core` compartido (filas de metadata, columna de espacio de trabajo) más un esquema por espacio de trabajo con las tablas reales de los objetos. Rutas de la columna «Cita» relativas a `packages/twenty-server/src/engine/` salvo que empiecen por `packages/`.

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| objectMetadata | nameSingular, namePlural, labelSingular, labelPlural, icon, color, isActive, isSystem, isUICreatable, writability, readability, sharingReach, isAuditLogged, isSearchable, duplicateCriteria (jsonb), shortcut, labelIdentifierFieldMetadataId, imageIdentifierFieldMetadataId, overrides | 1 a N campos, índices, vistas, layouts, permisos | `metadata-modules/object-metadata/object-metadata.entity.ts:48-228` |
| fieldMetadata | type, name, label, defaultValue (jsonb), options (jsonb, migrando a tabla), settings (jsonb), isNullable, isActive, isSystem, isUIEditable, isAuditLogged, writability, relationTargetFieldMetadataId, relationTargetObjectMetadataId, morphId | N a 1 objeto (CASCADE); 1 a 1 con su campo inverso en relaciones | `metadata-modules/field-metadata/field-metadata.entity.ts:52-247` |
| fieldMetadataOption | fieldMetadataId, value (inmutable), label, color, position, overrides, isActive | N a 1 campo; único (campo, valor) diferido | `metadata-modules/field-metadata-option/entities/field-metadata-option.entity.ts:26-74` |
| indexMetadata | name, objectMetadataId, isUnique, indexWhereClause, indexType (BTREE o GIN) | N a 1 objeto; N a N campos mediante indexFieldMetadata | `metadata-modules/index-metadata/index-metadata.entity.ts:24-89` |
| view | name, objectMetadataId, type, key, icon, position, isCompact, visibility, createdByUserWorkspaceId, mainGroupByFieldMetadataId, calendarLayout, calendarFieldMetadataId, calendarEndFieldMetadataId, kanbanAggregateOperation (+campo), anyFieldFilterValue, shouldHideEmptyGroups, shouldDisplayGroupsAsTabs, groupLoadLimit, deletedAt | N a 1 objeto; 1 a N campos, filtros, grupos de filtro, ordenamientos, grupos, grupos de campos | `metadata-modules/view/entities/view.entity.ts:72-311` |
| viewField | viewId, fieldMetadataId, isVisible, size, position, aggregateOperation, viewFieldGroupId, relationTargetFieldMetadataId | N a 1 vista; N a 1 campo (CASCADE) | `metadata-modules/view-field/entities/view-field.entity.ts:55-100` |
| viewFilter | viewId, fieldMetadataId, operand, value (jsonb), subFieldName, relationTargetFieldMetadataId, viewFilterGroupId, positionInViewFilterGroup | N a 1 vista; N a 1 grupo de filtros | `metadata-modules/view-filter/entities/view-filter.entity.ts:32-108` |
| viewFilterGroup | viewId, parentViewFilterGroupId, logicalOperator (AND, OR, NOT), positionInViewFilterGroup | árbol autorreferenciado | `metadata-modules/view-filter-group/entities/view-filter-group.entity.ts:24-71` |
| viewSort | viewId, fieldMetadataId, direction, subFieldName | N a 1 vista | `metadata-modules/view-sort/entities/view-sort.entity.ts:31-50` |
| viewGroup | viewId, fieldValue, position, isVisible | N a 1 vista (columnas del kanban) | `metadata-modules/view-group/entities/view-group.entity.ts:29-35` |
| pageLayout, pageLayoutTab, pageLayoutWidget | tipo, objectMetadataId, título, posición, layoutMode, tipo de widget, configuración jsonb | 1 a N pestañas, 1 a N widgets | `metadata-modules/page-layout/entities/page-layout.entity.ts:36-56`; `metadata-modules/page-layout-tab/entities/page-layout-tab.entity.ts:44-76`; `metadata-modules/page-layout-widget/entities/page-layout-widget.entity.ts:80-105` |
| validationRule | objectMetadataId, name, expression, bindings (jsonb), message, errorFieldMetadataId, isActive | N a 1 objeto | `metadata-modules/validation-rule/entities/validation-rule.entity.ts:32-72` |
| objectPermission, fieldPermission, rowLevelPermissionPredicate | roleId, objectMetadataId, canRead/Create/Update/SoftDelete/Destroy; fieldMetadataId; operand, value | N a 1 rol | `metadata-modules/object-permission/object-permission.entity.ts:53-68`; `metadata-modules/object-permission/field-permission/field-permission.entity.ts:50-54`; `metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts:99-108` |
| SyncableEntity (base) | universalIdentifier, applicationId, workspaceId | N a 1 aplicación (CASCADE) | `workspace-manager/types/syncable-entity.interface.ts:6-22` |

## Decisiones de diseño que se notan y su porqué

1. **Columnas reales en vez de EAV o jsonb para campos personalizados.** Cada campo nuevo crea una columna y, si hace falta, un enum o una llave foránea. Se gana: índices, ordenamiento y filtro nativos, tipos estrictos y una API generada que habla de columnas reales. Se paga: migraciones de esquema en caliente por cada cambio, que obligan al pipeline de validación y a un esquema por espacio de trabajo (H1, H20).
2. **Un esquema Postgres por espacio de trabajo.** El aislamiento multiempresa se resuelve con esquemas, no con una columna de empresa en cada tabla (`get-workspace-schema-context-for-migration.util.ts:20-25`). Es lo opuesto a la decisión de TailorSuite (una instalación por cliente).
3. **Catálogo cerrado de tipos con compuestos.** Moneda, dirección, correos, teléfonos y nombre completo son tipos de primera clase que se aplanan en columnas. Se evita que el usuario invente «campo moneda» como número suelto sin código de moneda (H2, H3).
4. **Metadata normalizada para las vistas.** Filtros, orden, columnas y grupos son tablas, no un blob. Permite validar cada fila contra los campos reales (operando válido, campo existente, agrupación permitida), borrar en cascada al desactivar un campo y componer vistas desde manifiestos (H11, H13, H15).
5. **Visibilidad binaria de vistas (WORKSPACE o UNLISTED) con un permiso global.** Mínimo vocabulario: no hay roles por vista ni listas de acceso por vista; un solo permiso (`VIEWS`) decide quién edita las compartidas (H12).
6. **Identificadores universales estables.** Cada entidad sincronizable lleva un UUID propio de la definición, distinto del id de fila; permite reinstalar, actualizar y diferenciar lo propio del módulo de lo que el cliente personalizó (H19).
7. **Separar «definición» de «personalización».** `overrides`, `writability`, `isUIEditable` y `isSystem` marcan qué puede tocar el cliente en objetos y campos estándar sin romper actualizaciones (H6, H7).
8. **Efectos laterales declarados en el motor.** Crear un objeto produce su vista por defecto, su formulario y sus relaciones del sistema, de forma determinista y con identificadores derivados del nombre, para que renombrar no duplique (H17, H20).
9. **Operandos y compilación de filtro compartidos entre frente y servidor.** Una sola fuente de verdad para qué se puede filtrar y cómo se traduce, en el paquete compartido (H13).
10. **Mucho código heredado por versiones.** Casi cada columna lleva un decorador con el nombre del comando de actualización que la introdujo o retiró, y hay campos duplicados deprecados para despliegues progresivos (`field-metadata.entity.ts:113-141,179-181` bajo `packages/twenty-server/src/engine/metadata-modules/field-metadata/`). Es el costo real de operar este modelo en producción con varias instancias.

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Tabla de definiciones de campos personalizados con catálogo cerrado de tipos y valores en una columna `jsonb` por registro, no columna física.**
- Idea: tomar la lista de tipos y su configuración por tipo (H2, H4) pero, en lugar de `ALTER TABLE` por campo, guardar los valores en una columna `custom jsonb` de cada tabla de negocio (cuentas, contactos, más adelante productos, facturas) y validar en servidor contra la definición. Con una instalación por cliente no hace falta aislamiento por esquema.
- Cita: `packages/twenty-shared/src/types/FieldMetadataSettings.ts:73-100`; `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:104-134`.
- Por qué le sirve: la pyme añade «sector», «canal de venta» o «límite de crédito» sin tocar código ni migrar la base. TailorSuite ya tiene campos personalizados en el CRM; esto los generaliza a todos los módulos con el mismo contrato.
- Esfuerzo: medio. Lo caro es la generalización a los futuros módulos, no el campo en sí.

**A2. Tipos compuestos como tipos de primera clase: moneda (importe + código), dirección, teléfono, correo, nombre completo.**
- Idea: definir cada compuesto como lista de propiedades con nombre y tipo (H3). En jsonb se guardan como objeto; en columnas físicas (datos propios del núcleo) como columnas separadas.
- Cita: `packages/twenty-shared/src/types/composite-types/currency.composite-type.ts:4-20`; `packages/twenty-shared/src/types/composite-types/composite-type.interface.ts:29-46`.
- Por qué le sirve: Colombia y Latinoamérica manejan COP, USD y más; un importe sin código de moneda es un error esperando. El importe en micros evita errores de punto flotante en facturación y cartera.
- Esfuerzo: bajo (definición y validadores) a medio (editores de interfaz por compuesto).

**A3. Opciones de selección con valor estable, etiqueta editable, color, posición y estado activo o inactivo.**
- Idea: tabla de opciones con `value` inmutable y `label` editable; una opción inactiva se conserva en los registros viejos y no se ofrece al elegir (H5).
- Cita: `packages/twenty-server/src/engine/metadata-modules/field-metadata-option/entities/field-metadata-option.entity.ts:26-67`; `packages/twenty-shared/src/types/FieldMetadataOptions.ts:5-18`.
- Por qué le sirve: etapas de venta, motivos de pérdida y estados cambian de nombre con frecuencia; renombrar sin perder el historial y retirar sin romper reportes es el caso diario.
- Esfuerzo: bajo.

**A4. Modelo de vista normalizado: vista + columnas + filtros + grupo de filtros anidado (AND/OR/NOT) + orden + grupos de kanban.**
- Idea: seis tablas pequeñas bajo un `view` por tipo de objeto, con tipos TABLE, KANBAN y CALENDAR y una clave `INDEX` para la vista por defecto (H10, H11).
- Cita: `packages/twenty-server/src/engine/metadata-modules/view/entities/view.entity.ts:110-251`; `packages/twenty-server/src/engine/metadata-modules/view-filter/entities/view-filter.entity.ts:48-66`; `packages/twenty-server/src/engine/metadata-modules/view-filter-group/entities/view-filter-group.entity.ts:24-37`.
- Por qué le sirve: da lista, tablero y calendario sobre cualquier módulo con una sola implementación de interfaz; la pyme guarda «clientes de Bogotá con cartera vencida» y el equipo comercial ve su propio embudo.
- Esfuerzo: alto la primera vez (componente de tabla configurable, tablero, calendario, constructor de filtros); luego cada módulo se vuelve configuración.

**A5. Visibilidad de vista de dos valores y un permiso global.**
- Idea: `workspace` (todos) o `unlisted` (solo el autor) más un permiso «gestionar vistas compartidas»; cualquier miembro edita sus vistas propias (H12).
- Cita: `packages/twenty-server/src/engine/metadata-modules/view/utils/is-view-visible-to-user.util.ts:4-20`; `packages/twenty-server/src/engine/permissions/metadata-permissions/services/view-access.service.ts:138-163`; `packages/twenty-front/src/modules/views/hooks/useCanPersistViewChanges.ts:8-25`.
- Por qué le sirve: sin consola de administración, cada vendedor se arma sus filtros y el administrador publica unas pocas vistas oficiales. En Postgres con RLS se resuelve con una política equivalente a `visibility = 'workspace' OR created_by = auth.uid()`.
- Esfuerzo: bajo. Encaja con el motor de permisos que TailorSuite ya tiene.

**A6. Operandos de filtro por tipo de campo en una tabla compartida, y un compilador único de filtro.**
- Idea: tabla estática tipo→operandos y una función que traduce el árbol de filtros a la consulta; el mismo módulo valida al guardar y compila al leer (H13).
- Cita: `packages/twenty-shared/src/utils/filter/utils/filterOperandsMap.ts:6-60`; `packages/twenty-shared/src/utils/filter/computeRecordGqlOperationFilter.ts:16-60`; `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/utils/get-incompatible-view-filter-operand-error.util.ts:11-43`.
- Por qué le sirve: evita filtros que no significan nada (contiene sobre un número) y asegura que lo que el usuario ve en pantalla es lo que consulta la base. Para TailorSuite el destino de compilación sería PostgREST o SQL parametrizado, no GraphQL.
- Esfuerzo: medio (la compilación a SQL seguro con jsonb y relaciones es la parte difícil).

**A7. Operandos de fecha relativa («en el pasado», «en el futuro», «hoy», rangos relativos).**
- Idea: operandos que no guardan fecha fija sino regla, y que se evalúan al abrir la vista (H13).
- Cita: `packages/twenty-shared/src/types/ViewFilterOperand.ts:1-17`; `packages/twenty-shared/src/utils/filter/dates/utils/relativeDateFilterAmountSchema.ts:1`.
- Por qué le sirve: «facturas vencidas», «tareas de esta semana», «contactos sin actividad en 30 días» son el núcleo de cartera y CRM y no se pueden guardar con fecha absoluta. Debe evaluarse con hora de Bogotá (UTC−5), regla ya del sistema.
- Esfuerzo: bajo a medio.

**A8. Restricciones de integridad en la propia metadata (kanban solo por selección o relación; CHECK en calendario; no desactivar el campo identificador).**
- Idea: validar al guardar y respaldar con `CHECK` de Postgres (H10, H14, H15).
- Cita: `packages/twenty-server/src/engine/metadata-modules/view/entities/view.entity.ts:87-90`; `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/utils/is-allowed-flat-view-kanban-main-group-by-field.util.ts:6-24`; `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-field-metadata-validator.service.ts:170`.
- Por qué le sirve: que un administrador no técnico no pueda dejar una vista rota; los errores se detectan al guardar, no cuando alguien abre la pantalla.
- Esfuerzo: bajo.

**A9. Desactivar en lugar de borrar un campo, con limpieza en cascada de vistas.**
- Idea: `isActive=false` oculta el campo, conserva los datos y retira filtros y columnas que lo usaban (H15). Borrado físico solo como acción explícita aparte.
- Cita: `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/handle-field-metadata-deactivation-side-effects.util.ts:31-70`.
- Por qué le sirve: el error más común de un administrador de pyme es borrar un campo que luego necesita; con desactivación el dato vuelve.
- Esfuerzo: bajo.

**A10. Paquete base de campos y relaciones que todo objeto nuevo recibe (id, creado, actualizado, borrado lógico, creado por con origen, posición; y vínculo a notas, tareas y adjuntos).**
- Idea: cualquier tipo de documento o entidad personalizada nace con historial, actividades y archivos sin configurarlos (H8). El «creado por» guarda el origen (manual, importación, API) además del usuario.
- Cita: `packages/twenty-server/src/engine/twenty-orm/custom.workspace-entity.ts:17-27`; `packages/twenty-shared/src/types/composite-types/actor.composite-type.ts:8-19`; `packages/twenty-shared/src/metadata/constants/default-relations-object-standard-ids.constant.ts:3-8`.
- Por qué le sirve: TailorSuite ya tiene auditoría y actividades en el CRM; hacer que sean obligatorias para todo módulo futuro evita rehacer esa integración en inventario, compras y ventas.
- Esfuerzo: medio (relación polimórfica con tabla de vínculos de tipo + id, sin llave foránea real a diferencia del modelo de Twenty).

**A11. Regla de validación por expresión, definida por el administrador, compilada contra los campos del objeto.**
- Idea: «si estado = ganada, el importe es obligatorio», «la fecha de vencimiento no puede ser anterior a la emisión»; la expresión se compila al guardar y se evalúa antes de grabar el registro, con un mensaje y un campo de error (H16).
- Cita: `packages/twenty-server/src/engine/metadata-modules/validation-rule/entities/validation-rule.entity.ts:32-72`; `packages/twenty-shared/src/utils/validation-rule/compileValidationRuleExpression.ts:14-55`.
- Por qué le sirve: cubre la necesidad de «campo obligatorio condicional» sin programación. La implementación de servidor de Twenty es Enterprise; hay que escribir una propia con una gramática mínima.
- Esfuerzo: alto con gramática propia; medio si se limita a reglas del tipo «campo X obligatorio si campo Y tiene valor Z».

**A12. Formulario de creación derivado de la metadata, separado de la vista.**
- Idea: un layout «Creation Form» por objeto con un widget por campo creable, que se llena solo al crear campos y excluye los tipos sin entrada (H17).
- Cita: `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-record-form-widget-on-create-side-effect-handler.service.ts:29`; `packages/twenty-shared/src/types/page-layout/PageLayoutType.ts:1-7`.
- Por qué le sirve: el formulario de alta rápido y el orden de campos se ajustan por instalación sin código; React lo pinta con un renderizador por tipo.
- Esfuerzo: medio.

**A13. Página de detalle del registro como layout de pestañas y widgets guardado en metadata.**
- Idea: pestañas (campos, actividad, notas, archivos) y widgets que incrustan una vista filtrada de registros relacionados (H18). Los campos se agrupan por secciones (`viewFieldGroup`).
- Cita: `packages/twenty-server/src/engine/metadata-modules/page-layout/entities/page-layout.entity.ts:36-56`; `packages/twenty-server/src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity.ts:80-105`; `packages/twenty-shared/src/types/page-layout/WidgetType.ts:1-35`.
- Por qué le sirve: la ficha de una cuenta con sus contactos, facturas y cartera es la pantalla más usada de un ERP de pyme. Con widgets de vista incrustada se arma sin código por módulo.
- Esfuerzo: alto. Conviene empezar con layout fijo por módulo y dejar los widgets configurables para después.

**A14. Módulos «a la carta» como paquetes declarativos con identificadores estables.**
- Idea: cada módulo de TailorSuite (inventario, compras…) se describe como un manifiesto con sus objetos, campos añadidos a objetos del núcleo, vistas por defecto, roles y menú; el instalador lo sincroniza y puede reinstalarse o desinstalarse (H19). El ejemplo inmobiliario añade campos a Persona, dos objetos nuevos, siete vistas y cuatro roles sin código de servidor.
- Cita: `packages/twenty-apps/internal/real-estate/src/application.config.ts:6-11`; `packages/twenty-apps/internal/real-estate/src/fields/person-type.field.ts:16-26`; `packages/twenty-apps/internal/real-estate/src/views/buyer-pipeline.view.ts:28-59`; `packages/twenty-server/src/engine/workspace-manager/types/syncable-entity.interface.ts:6-22`.
- Por qué le sirve: coincide con «módulos a la carta que activa quien instala» y con la posibilidad de vender verticales (por ejemplo taller o distribuidora) como paquetes de configuración. El `universalIdentifier` permite actualizar el paquete sin pisar lo que el cliente personalizó.
- Esfuerzo: alto (instalador, desinstalador, diferencias entre versiones). Versión mínima de esfuerzo medio: semillas SQL idempotentes con UUID fijos por módulo.

**A15. Capa de personalización sobre lo estándar (`overrides` y banderas `isUIEditable`, `isSystem`, `writability`).**
- Idea: el cliente puede cambiar etiqueta, color y opciones de objetos y campos del módulo, pero no su nombre técnico ni su tipo; las actualizaciones del módulo no pisan esas sobrescrituras (H6, H7).
- Cita: `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts:3-29`; `packages/twenty-server/src/engine/workspace-manager/types/overridable-entity.type.ts:7-15`.
- Por qué le sirve: al ser una instalación por cliente con actualizaciones periódicas, evita que «traducir» una etiqueta bloquee la siguiente versión.
- Esfuerzo: medio.

**A16. Permisos por rol sobre objeto y campo guardados como metadata, y permisos por fila con la misma forma que un filtro.**
- Idea: tabla rol×objeto con leer, crear, actualizar, borrar lógico, destruir; tabla rol×campo; y predicados por fila que comparan un campo del registro con el usuario actual (H21).
- Cita: `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts:53-68`; `packages/twenty-server/src/engine/metadata-modules/object-permission/field-permission/field-permission.entity.ts:50-54`; `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts:99-108`.
- Por qué le sirve: RLS de Postgres puede evaluar «responsable = usuario actual» directamente; la idea útil es expresar la regla como dato editable por el administrador y compilarla a política RLS o a condición de consulta.
- Esfuerzo: alto si se compila a políticas RLS dinámicas; medio si se aplica en la capa de consulta.

## No conviene copiar (y por qué)

1. **`ALTER TABLE` en caliente por cada campo personalizado y un esquema por espacio de trabajo.** Trae un pipeline completo de validación, ordenamiento de acciones, enums de Postgres y reintentos; es la mayor parte de la complejidad de este repo (H1, H20). Para una instalación por cliente sin multiempresa, el jsonb validado (A1) da la mayor parte del valor con una fracción del riesgo operativo. Si más adelante un campo necesita índice o agregación pesada, se promueve a columna por migración manual.
2. **La arquitectura de cachés planos de metadata (`flat-*` por cada entidad), universal-flat, mapas por UUID universal y comandos de actualización por versión.** Existe para operar muchas instancias y despliegues progresivos con pods de versiones mezcladas (`packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:179`). TailorSuite no tiene ese problema.
3. **El código de reglas de validación por expresión del servidor y cualquier archivo marcado Enterprise.** Está bajo licencia comercial (`LICENSE:4-5`; marca en `packages/twenty-server/src/engine/metadata-modules/validation-rule/utils/compile-validation-rule-expression-or-throw.util.ts:1`). La idea de A11 se puede estudiar; la implementación no se toca. Un conteo rápido encontró 795 archivos con esa marca bajo `packages/`, así que conviene revisar el encabezado antes de leer otra zona.
4. **Relaciones polimórficas con tipo MORPH_RELATION y su regla de nombres derivados.** Hay campos espejo por objeto objetivo, índices, comprobaciones de consistencia y múltiples utilidades solo para mantenerlos (`packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts:54-57,233-238`). Para notas y tareas basta una tabla de vínculos con (`tipo`, `registro_id`).
5. **Tipos de widget y de objeto ligados al producto de Twenty (workflows, agentes de IA, hilos de chat, correo, grabaciones de llamada, campañas de mensajes).** No aplican a un ERP de pyme (`packages/twenty-shared/src/types/page-layout/WidgetType.ts:1-35`).
6. **Compuesto ACTOR con diez orígenes.** Útil el concepto de «origen», pero la lista pertenece a su producto (`packages/twenty-shared/src/types/composite-types/actor.composite-type.ts:8-19`).
7. **API GraphQL generada por espacio de trabajo con SDL calculado en memoria** (`packages/twenty-server/src/engine/api/graphql/workspace-schema.factory.ts:22-70`). Con Supabase la API ya sale del esquema; replicar el patrón GraphQL añadiría un servidor.

## No leído o dudoso

- No se leyó el cuerpo del frente más allá de los hooks de vistas y filtros: el renderizado de tabla, tablero y calendario, el arrastre en kanban (campo de tipo POSITION) y el constructor de filtros avanzado no se verificaron. La dimensión «formulario» se cubre solo a nivel de metadata (`RECORD_FORM`), no de interfaz.
- No se abrió la gramática exacta del evaluador de expresiones de las reglas de validación (el compilador importa el paquete `expr-eval-fork`, `packages/twenty-shared/src/utils/validation-rule/compileValidationRuleExpression.ts:1`), ni la lista de funciones disponibles.
- El detalle de `pageLayoutWidget.configuration` por tipo de widget no se leyó: solo se vieron la columna y los tipos de widget.
- No se verificó cómo el motor de migraciones crea y modifica los enums de Postgres para SELECT (`collectEnumOperationsForField`, usado en `create-field-action-handler.service.ts` cerca de la línea 245) ni cómo se migran los datos al renombrar o eliminar una opción. Hay una migración en curso de `options` jsonb a tabla (comentario en `field-metadata.entity.ts:129`) y su estado final es dudoso.
- No se revisó la importación de CSV (`spreadsheet-import` del frente), el modelo de duplicados (`duplicateCriteria`, `object-metadata.entity.ts:208-209`) ni el índice de búsqueda por campo (`searchFieldMetadata`).
- No se leyó el mercado de aplicaciones ni el modelo de actualización entre versiones de una aplicación (`application-upgrade`, `application-marketplace`); la afirmación de que el `universalIdentifier` protege las personalizaciones del cliente se deduce de H6, H7 y H19, no de una lectura del flujo de actualización.
- No se verificó si los cambios de metadata invalidan explícitamente el esquema GraphQL cacheado; solo se vio que el SDL se obtiene o recalcula con `getOrComputeSchemaSDL` (`workspace-schema.factory.ts:26-30`).
- El orden y los nombres de los operandos en las demás filas de `FILTER_OPERANDS_MAP` (más allá de TEXT, EMAILS, FULL_NAME, ADDRESS, LINKS, PHONES, CURRENCY y parte de NUMBER) no se revisaron.
- No se confirmó que la ejecución de metadata y esquema sea una sola transacción atómica; se vio el uso de `queryRunner` en los manejadores pero no el límite de transacción del orquestador.
