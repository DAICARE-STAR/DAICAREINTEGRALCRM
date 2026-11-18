# Comparativa de cinco ERP y CRM de código abierto para Bash Logistics

Síntesis de las fichas `odoo.md` (ODO-01 a 25), `erpnext.md` (ERP-01 a 25), `twenty.md` (TWE-01 a 21), `monica.md` (MON-01 a 21) y `platform.md` (Huly Platform, PLA-01 a 25), contrastadas con el estado del producto el 2026-11-17 (`main` en 0.2.16, `c06243b`; 0.2.17 y 0.2.18 son solo documentación y 0.2.19 solo toca el escáner de secretos). Las 117 propuestas se fusionan y priorizan en `backlog.md`. La síntesis no volvió a abrir los repos; la revisión crítica (`revision-critica.md`) sí abrió las citas de 25 BL y corrigió atribuciones que las fichas daban por respaldadas. Licencias LGPL, GPL, AGPL y EPL: aquí solo hay ideas, ningún código.

## En resumen

- Ninguno de los cinco sirve como base: Odoo y ERPNext son la referencia de modelo de datos para inventario, compras, facturación, cartera y contabilidad; Twenty y Huly, de la mecánica transversal (permisos, vistas, flujos, esperas); Monica, de detalles del CRM.
- Bash Logistics ya va por delante en el modelo de módulos (registro con dependencias, RLS restrictiva por módulo, una base por cliente) y en privacidad (salud cifrada con MFA y registro de accesos).
- Lo que más se repite entre repos y aún falta en el núcleo: numeración atómica en la base, estados de documento con transición atómica, aprobaciones, esperas programadas en Postgres y vistas guardadas en el servidor. Varias de esas piezas, tal como se proponen, son endurecimiento propio sobre lo que hacen los repos (numeración fiscal sin huecos, libro de inventario de solo inserción, cartera derivada al leer).
- El CRM que se entregará al primer cliente, que aún no lo recibe, tiene cierres que conviene hacer antes de que haya datos: duplicados con una función de base, «lo mío o sin asignar» en todas las tablas hijas, exportar como permiso aplicado en la base, catálogos con clave protegida y tipo de documento DIAN. Son más caros de lo que parecían: cinco de los diez del primer lote son de esfuerzo medio.
- Hueco serio del producto: once módulos figuran como `disponible` con ruta y sin pantalla; nueve declaran un archivo de esquema que no existe (entre ellos `productos` y `cotizador`, de los que dependen los ERP planeados) y dos, `correo` y `disenos`, se activan sin error y quedan visibles mostrando «Módulo no disponible».
- Hay que decidir antes de la 0.7: estado y clasificación de los módulos (D-1), dependencias de los ERP y terceros, juntas (D-2, D-3), el orden de las fases (D-14), si hay multimoneda (D-15) y dónde viven plan de cuentas y periodos (D-19). La nota crédito en cartera (D-5) es una pregunta abierta al usuario.
- Tras fusionar quedan 73 propuestas (BL-01 a BL-73, 79 filas porque seis se parten en dos); el primer lote recomendado tiene 10 y hay tres contratos ERP que se fijan al abrir el primer esquema ERP.

## Tabla por dominio

Huly figura como «Huly» (carpeta `platform`). Twenty, Monica y Huly no tienen operaciones ni finanzas; Twenty, ERPNext (sin HRMS en el clon) y Monica no tienen RR. HH.

| Dominio | Odoo | ERPNext | Twenty | Monica | Huly | Mejor referencia para Bash Logistics y por qué |
|---|---|---|---|---|---|---|
| Módulos y dependencias | Manifiesto con `depends` mínimos (`purchase` solo de `account`, `sale` sin `stock`), mecanismo `auto_install` y `must_install` para módulos que se instalan solos cuando coexisten otros (el clon de 18 addons no trae ningún puente entre módulos de negocio) e interruptores de función. | Lista plana sin dependencias: todo el esquema está siempre y activar es ocultar. | CRM fijo más «aplicaciones» por manifiesto, con identificador estable por fila sembrada y sin dependencias entre apps. | No hay módulos instalables; «módulo» es un bloque de la ficha de contacto. | Una fila de configuración enciende o apaga el módulo solo en la interfaz; los datos quedan. | Odoo, por las dependencias mínimas (compras no exige inventario) y el mecanismo de instalación automática, sobre el que el puente por pareja es diseño propio; de Twenty, el identificador estable y el dueño de cada fila sembrada. El registro de Bash Logistics ya supera a los cinco en validación y RLS por módulo. |
| CRM y ventas | Lead aparte del tercero, ganado y perdido derivados de la etapa y del archivo, actividades con vencimiento, cotización y pedido en un documento. | Lead, Prospect y Customer separados, oportunidad bloqueada por sus cotizaciones, cotización con revisiones y pérdida con motivo obligatorio; al crear un lead, bloqueo por correo exacto. | Oportunidad con etapa en kanban, duplicados declarativos, fusión que no pierde datos ocultos e historial que se funde por autor. | CRM de relaciones: varios canales tipados, relaciones con inverso, recordatorios recurrentes, línea de tiempo escrita a mano. | Lead como tarea sin monto; duplicados por igualdad exacta de canal y nombre aproximado con `$like`, sin bloquear; cliente como rol a demanda sobre el contacto. | Odoo para el modelo (oportunidad aparte, perdido como archivo con motivo, actividades programadas); Twenty y Huly para la calidad de datos (duplicados y fusión). Los criterios y el puntaje de duplicados de BL-18 son propios. |
| Operaciones | Movimientos entre ubicaciones con virtuales, saldo por producto, ubicación y lote que se actualiza en sitio con un bloqueo que no espera, reposición mínimo-máximo sobre la proyección. | Libro de stock con saldo en caché que se cancela marcando y se reprocesa, reorden contra la proyección, unidad y factor congelados por línea, conteo físico como documento. | — | — | El «inventario» es un catálogo con SKU, sin cantidades. | Odoo por el modelo de ubicaciones y saldo; ERPNext por la unidad congelada, el conteo físico y la recepción con rechazo. Ambos calculan la proyección y no la guardan en el producto. El libro de solo inserción con anulación por reverso es propio. |
| Finanzas | La factura es un asiento; cartera por cruces parciales con saldo y estado almacenados que se recalculan al cruzar; impuestos y retenciones como filas; cierre por fecha de bloqueo con excepciones; plantilla colombiana de impuestos. | Libro mayor único con función de publicación, libro de pagos aparte con `outstanding_amount` guardado, pagos con asignaciones, retenciones con vigencia, cierre por periodo y PUC verificado. | — | Solo préstamos con monto entero; no sirve. | — | Odoo para la estructura (documento único y cartera por cruces, sin libro auxiliar separado); ERPNext para la función única de publicación, pagos, retenciones y cierre. Derivar el saldo al leer, sin campo almacenado, es propio y su costo está por medir. Ninguno trae DIAN: factura electrónica, CUFE y UVT se diseñan desde la norma. |
| RR. HH. | Empleado con versiones fechadas, vista pública de solo lectura, ausencias declarativas con saldo desde asignaciones. | Solo el vínculo usuario-empleado y la regla de fila «mis reportes». | — | — | Departamentos en árbol, ausencias con factor firmado y festivos por departamento; la autorización vive solo en el cliente. | Odoo por la privacidad en dos capas y las versiones; de Huly, la simplicidad del factor firmado y el árbol de departamentos llevado a RLS. Nómina no está en ninguno. Los datos sensibles del empleado los fija D-18. |
| Permisos | Grupos aditivos más restricciones globales, que se traducen casi uno a uno a políticas RLS permisivas y restrictivas; «lo mío o sin asignar». | Matriz por rol más reglas de fila separadas del rol, compartir puntual, nivel y máscara por campo, bitácora de cambios de permisos. | Objeto, campo (solo resta) y fila, banderas de función como exportar, historial depurado con lo que el lector no puede ver. | Nivel como entero ordenado, revalidación en cada servicio y la regla de no quitarse el rol de administrador ni borrarse a uno mismo (no cuenta administradores). | Permisos como datos con prohibiciones y coincidencia sobre la operación; invitados con fallo cerrado; exportar solo para el dueño del espacio. | Odoo, porque su fórmula es la de RLS; de Twenty, que el permiso de campo solo reste y que el historial lo respete; de Monica, la regla «no sobre uno mismo», que el producto lleva a una guarda del último administrador con conteo propio. |
| Extensibilidad | Campos reales con ALTER TABLE o Properties en JSONB; filtros guardados privados o compartidos. | Metamodelo DocType con DDL en caliente; vistas guardadas con dueño opcional y vistas estándar versionadas. | Todo es metadato con ALTER TABLE; opciones con clave inmutable y estado activo; vistas normalizadas con operandos por tipo. | Ficha armada por plantilla, páginas y bloques ordenables; nombres editables sobre una clave, sin proteger lo que está en uso. | Campos en JSONB, registro de tipos con editor y filtro, vistas en tres capas, modos de fecha con nombre. | Twenty para catálogos y vistas (clave inmutable, operandos validados, fechas relativas); Huly para el registro de tipos de campo; Monica para la ficha por bloques. Ninguno con DDL en caliente: Bash Logistics sigue con JSONB validado. |
| Automatización | Reglas con catálogo cerrado de disparadores, anti-recursión, cron con `SKIP LOCKED`, secuencias por serie (el modo `no_gap` existe, pero en el clon solo numera pagos agrupados; las facturas numeran con `sequence_mixin`). | Flujos de aprobación por datos, autorización por monto, motor con cola, numeración por serie con bloqueo de fila que espera; recurrencias que pierden el día. | Esperas durables en Postgres, versiones con una sola activa, fallos guardados como datos, reintentos automáticos, cambio de estado atómico. | Recordatorios recurrentes con procesador que aísla cada fallo y canal que se apaga tras fallos. | Estados con categoría fija, control optimista sobre la ejecución de procesos, aprobación genérica, bloqueo durante la aprobación y temporizadores en una tabla; reglas que no se reintentan solas. | Twenty para la ejecución (esperas, versiones, fallos como datos) y Huly para la forma (estados, aprobación, bloqueo) y para no reintentar solo; de ERPNext, la autorización por monto. Todo con catálogo cerrado de acciones, nunca código evaluado. |
| Integración | Importador con simulacro en savepoint e identificador externo; webhooks sin firma; portal con token. | Webhooks con HMAC, bitácora y reintento, bloqueo SSRF; importación por lotes con registro por fila y reanudación. | Llave API como fila con rol propio; webhook con rol que filtra eventos; exportación en segundo plano. | Estándares (vCard, iCal, CardDAV); webhook entrante que no provoca reintentos inútiles. | Tokens con vigencia y tope, exportación CSV y JSON asíncrona con aviso, enlace público con restricciones, importación por modelo intermedio. | ERPNext para webhooks e importación; Twenty para credenciales con rol; Huly para el enlace público. El importador y el exportador del CRM ya resuelven lo que más importa en Colombia (BOM, `;`, fórmulas). |

## Patrones en los que coinciden varios

Cuando dos o más repos llegan por su lado a la misma solución, la señal es fuerte. Entre paréntesis, la BL que la recoge. Cuando la parte más fuerte de la propuesta no la hace ningún repo, se dice.

1. Numeración en la base, por serie con prefijo y bloqueo de fila: ODO-06 (`ir.sequence`), ERP-01 (`tabSeries`); Huly lo hace en el navegador y su ficha lo desaconseja. El modo sin huecos para lo fiscal es diseño propio: en el clon de Odoo `no_gap` solo numera pagos agrupados (BL-05a, BL-05b).
2. Estados de documento cortos, transición condicionada al estado esperado y avance derivado de las líneas: PLA-06, TWE-03, ODO-05, ODO-14, ERP-12; Huly lo aplica a la ejecución de procesos y la transición con permiso es propia (BL-06, BL-07, BL-56).
3. Aprobación por umbral o genérica, con bloqueo mientras dura: ODO-07, ERP-02, PLA-05, PLA-03 (BL-45, BL-57).
4. Duplicados como aviso antes de guardar, no como bloqueo: ODO-19, TWE-05, PLA-01; ERPNext bloquea por correo exacto (ERP-15). Criterios, normalización y puntaje de BL-18 son propios (BL-18).
5. Fusión con lista cerrada de tablas hijas y en una transacción: TWE-17, PLA-21, ERP-15 (BL-31).
6. Actividades o tareas con vencimiento, responsable y estado calculado: ODO-10, MON-07, MON-03 (BL-22, BL-33).
7. Esperas y temporizadores en una tabla Postgres con reclamo atómico: TWE-07, PLA-07 (BL-38).
8. Un solo motor de reglas con catálogo cerrado, anti-recursión y registro de ejecuciones: ODO-25, ERP-18, TWE-18, PLA-16; difieren en los reintentos, y se adopta el criterio de Huly (BL-46).
9. Vistas y filtros guardados en el servidor, privados o de equipo, con fechas relativas: ODO-20, ERP-20, TWE-08, PLA-08, PLA-02 (BL-24, BL-41).
10. Importación con simulacro, errores por fila e identificador externo: ODO-18, ERP-17, PLA-18, MON-17 (BL-44).
11. Exportar como permiso aparte de leer: ODO-08; bandera en Twenty; Huly lo limita al dueño del espacio (BL-12a).
12. Permiso por campo que oculta costos y salarios, también en el historial: ERP-23, TWE-09, PLA-22 (BL-43).
13. Visibilidad por responsable o por ámbito, separada del rol: ODO-03, ERP-22, PLA-25 (BL-11, BL-51).
14. Varios canales de contacto como filas tipadas: MON-02, PLA-20 (BL-19).
15. Oportunidad como entidad aparte de la cuenta, con motivo de pérdida de catálogo: ODO-09, ERP-21; Twenty y Huly muestran el costo de no tenerla (BL-30).
16. Línea de tiempo única de la cuenta: MON-04, PLA-13, TWE-10. Monica la escribe a mano en cada servicio y muestra el costo; escribirla por triggers es propio (BL-23, BL-28).
17. Catálogos con clave inmutable, nombre editable y estado activo: TWE-11, MON-11, MON-08. Proteger lo que está en uso es propio: Monica no lo hace (BL-15a, BL-15b).
18. Plantillas con marcadores de una lista cerrada, sin código: TWE-13, PLA-15; Odoo tiene el mismo modo por expresión regular (BL-39).
19. Webhooks firmados con bitácora y reintento: ERP-25, TWE-16, MON-16 (BL-49, BL-66).
20. Credenciales de API con hash, vencimiento y alcance: PLA-19, TWE-16; MON-20 queda aplazada hasta que haya API pública (BL-50).
21. Kanban por etapa con orden manual barato: TWE-19, PLA-14 (BL-32).
22. Campos propios generalizados con registro de tipos: ODO-22, PLA-23 (BL-42).
23. Reposición contra la existencia proyectada, que se calcula y no se guarda: ODO-15, ERP-03 (BL-55).
24. Inventario como movimientos entre ubicaciones con saldo materializado: ODO-17, ERP-16. Ninguno es de solo inserción (ERPNext marca cancelado y reprocesa; Odoo actualiza en sitio): el libro con anulación por reverso es propio (BL-53).
25. Un solo documento contable con cuadre al publicar: ODO-11, ERP-05 (BL-60).
26. Cartera derivada de los cruces: ODO-12, ERP-06. Ninguno la deriva sin guardar el saldo (Odoo lo almacena al cruzar; ERPNext suma un libro de pagos aparte y guarda `outstanding_amount`); derivarla al leer es propio (BL-63).
27. Impuestos y retenciones como filas con vigencia: ODO-13, ERP-08, ERP-09 (BL-61, BL-62).
28. Cierre por fecha o periodo con excepciones nominales: ODO-21, ERP-11 (BL-69a, BL-69b).
29. Ausencias como tipos declarativos con saldo calculado: ODO-24, PLA-17 (BL-72).
30. Seguimiento de la propia cartera (seguidos, favoritos, frecuentes): PLA-12, MON-10 (BL-26).

## Dónde Bash Logistics ya está igual o mejor

- **Registro de módulos.** `src/lib/modulos.ts` declara `depende` e `integra`, permisos, widgets, tablas, archivo de esquema y límites tipados, y valida activación y desactivación con cascada. ERPNext y Huly no tienen dependencias; Twenty solo un rango semver; Monica no tiene módulos.
- **Apagar un módulo apaga sus datos.** La política restrictiva `modulo_<slug>` bloquea las filas; ERPNext y Huly solo esconden el menú.
- **Una base por cliente con RLS** (PP-DEC-01). Monica, Huly y Twenty filtran la empresa en el código o en el ORM; un olvido expone datos.
- **Activa quien instala** (PP-DEC-04), con el script de service role; nadie instala módulos desde la interfaz del cliente, como sí permiten Odoo y Huly.
- **Autoría sellada por la base en el CRM.** `crm_preparar` fija `created_by := auth.uid()` sin excepción; Twenty sella en la capa de servicio y respeta un `createdBy` enviado con nombre.
- **Cuenta única persona o empresa**, con contactos aparte. Evita las tres entidades de ERPNext y el tercero único de Odoo.
- **Etapas con cierre** (`ganada`, `perdida`) en el catálogo de `crm_ajustes()`. Twenty no tiene etapa perdida y la etapa de ERPNext no tiene orden.
- **Historial por trigger** (`crm_cambios` con antes y después, suprimido con la entidad) y auditoría de roles (`auditar_cambio`). Monica escribe la línea de tiempo a mano en cada servicio.
- **Campos propios en JSONB validado** (`crm_campos_def`, `campos`), sin ALTER TABLE en caliente como Odoo, ERPNext y Twenty.
- **Datos de salud** (PP-DEC-19): cifrado con clave en Vault, MFA obligatorio, registro de accesos y nada en historial, búsqueda ni exportación. Ninguno de los cinco tiene algo comparable.
- **CSV para Excel en Colombia.** `src/modulos/crm/lib/csv.ts` escribe con BOM y `;`, detecta separador y neutraliza fórmulas con una excepción para números y teléfonos; Huly no pone BOM y Twenty usa un carácter de ancho cero.
- **Importador del CRM** con tope de 10 000 filas, alias de encabezados, plan por fila (crear, actualizar, error) y clave por documento normalizado o por tipo más nombre normalizado. La tabla `crm_vinculos_externos` existe en el esquema para el identificador externo, pero ningún código la lee ni la escribe (solo la service role puede escribirla).
- **Seguridad de base.** `roles_guard_escalada` impide otorgar lo que no se tiene; `api_rate_limits` da la cuota; `autorizacion.mts` define `Requisitos` y `cumpleRequisitos`, y `componer` en `connector-proxy.mts` niega una acción que no figura en el registro o está repetida; el núcleo no se desactiva; la pertenencia contacto-cuenta la comprueba la base (`crm_contacto_cuenta`); la interfaz impide que un administrador se quite su propio rol.
- **El instalador falla cerrado** cuando falta el archivo de un módulo con `sql` (sale con 2 sin escribir). No cubre los módulos sin `sql`.

## Huecos del producto que el análisis destapó

Comprobados sobre el repo el 2026-11-17 y corregidos por la revisión crítica.

1. **Módulos `disponible` con ruta y sin pantalla.** Son once; solo `crm` tiene `src/modulos/<slug>/rutas.tsx`. Nueve declaran un archivo de esquema que no existe (`10-calendario.sql`, `11-chat.sql`, `13-manuales.sql`, `20-proyectos.sql`, `22-catalogo.sql`, `23-cotizador.sql`, `26-gerencia.sql`, `27-licitaciones.sql` y `28-sitio-web.sql`; `supabase/esquema` solo tiene `00` a `09`, `21-crm.sql` y `21b-crm-consentimiento-reloj.sql`) y con ellos el instalador sale con 2. Dos, `correo` y `disenos`, no tienen `sql`: el instalador los activa sin error y quedan visibles en el menú mostrando «Módulo no disponible». `docs/modulos.md` los muestra como disponibles, y el registro, que es la fuente única (PP-DEC-04), dice algo que no es cierto.
2. **La cadena de los ERP cuelga de módulos sin portar.** Inventario depende de `productos` y ventas de `cotizador`, y ninguno de los dos tiene esquema. `productos` arrastra marcas y tasas por marca, y `cotizador` usa tablas de la empresa de origen. Antes de la 0.7 hay que portar el catálogo o cambiar esas dependencias (D-1, D-2). La unidad base y el factor (BL-52) también van en el catálogo.
3. **Dependencias duras al revés de lo que hacen Odoo y ERPNext.** Ventas exige inventario, facturación exige ventas y compras, contabilidad exige inventario. Una pyme de servicios no podría facturar sin activar compras e inventario.
4. **Choque de nombres.** `cotizador` declara la tabla `crm_clients`, con el prefijo del módulo CRM nativo, y su política restrictiva sería `modulo_cotizador` sobre una tabla `crm_*`. Con el CRM nativo, el cotizador debería leer `crm_cuentas` (ya declara `integra: ['crm']`).
5. **Dos fuentes de facturas por venir.** Gerencia declara `facturas`, `factura_lineas` y `factura_vinculos` alimentadas por el conector `facturacion`; el módulo `facturacion` planeado tendrá las suyas. No hay decisión sobre cuál manda. Sale del registro: `26-gerencia.sql` no existe, así que no se comprobó en el esquema.
6. **Sin guarda del último administrador en la base.** El shell ya impide que un administrador se quite su propio rol (`MembersTab.tsx`), pero la política `user_roles_delete` lo permite por API y la baja desde el panel de Supabase borra perfil y rol en cascada; nada impide dejar la instalación sin administrador por esas vías.
7. **CRM con un solo teléfono y un solo correo** por cuenta y por contacto, el teléfono como texto libre sin índice, y `documento` sin tipo DIAN ni dígito de verificación aparte (se guarda fusionado).
8. **`crm_actividades` es solo registro de lo hecho**: sin vencimiento, responsable ni estado; no hay recordatorios.
9. **Visibilidad total dentro del CRM.** Quien tiene `app_crm` ve todas las cuentas, contactos, actividades, consentimientos y vínculos, y todo `crm_cambios`: las seis políticas de lectura usan `puede_ver_app('crm')`.
10. **Exportar no es un permiso.** Basta poder leer. La exportación se registra desde el cliente (`crm.exportar`, número de cuentas), pero eso no la limita, y el mismo dato sale paginado con `crm_buscar` o `crm_cuentas`.
11. **Catálogos sin protección de claves en uso.** Etapas, orígenes, tipos de empresa, relaciones y opciones de `crm_campos_def` se pueden renombrar o quitar desde la pantalla sin comprobar uso (la clave de una etapa es editable), y renombrar deja huérfanos los registros. Las etiquetas son texto libre.
12. **Sin `updated_by` ni columna de procedencia del registro** (`origen` en `crm_cuentas` es el canal de captación), y sin control de edición concurrente: las actualizaciones de `src/modulos/crm/lib/datos.ts` no comparan `updated_at`, el formulario envía todos los campos y `guardarAjustesCrm` reescribe `instalacion.ajustes` completo.
13. **Ajustes sin forma declarada en el registro ni validada en la base.** La forma de `instalacion.ajustes.crm` se valida solo en el cliente (`validarAjustes`, `leerAjustes`); la base solo cae a los valores por defecto si una lista está vacía, y el registro tipa los límites pero no los ajustes.
14. **Ninguna pieza transversal para los ERP**: ni numeración, ni transición de estados, ni aprobaciones, ni tabla de tareas programadas, ni vistas guardadas en el servidor (los filtros del CRM viven en la URL).
15. **El orden y el alcance de las fases 0.3 a 0.11 no están escritos** en ninguna PP-DEC más allá de PP-DEC-13. Este análisis supone, a falta de D-14: 0.7 inventario y compras, 0.8 ventas y pedidos, 0.9 facturación y cartera, 0.10 contabilidad, 0.11 RR. HH.
16. **Sin flujo de baja de miembro.** Las bajas se hacen en el panel de Supabase (`MembersTab.tsx`), fuera del producto, y dejan la cartera sin responsable (`on delete set null`).
17. **Sin regla de supresión para tablas nuevas.** Hoy el borrado físico suprime el historial y los vínculos de la entidad (Ley 1581, art. 8; PP-R5), pero nada obliga a una tabla nueva con datos de personas a hacerlo.

## Decisiones que habría que tomar o reabrir

### D-1. Estado y clasificación de los módulos sin pantalla

- Opción a: dejarlos como `disponible`; el instalador ya falla cerrado con los que tienen `sql`.
- Opción b: marcarlos `planeado` (o un estado nuevo «por portar») hasta que llegue su archivo y su pantalla, con una prueba que exija que todo módulo `disponible` con ruta tenga `src/modulos/<slug>/rutas.tsx`, y con `sql`, su archivo en `supabase/esquema`.
- Opción c: además de b, clasificar cada módulo disponible como núcleo del producto, opcional del producto o heredado de la empresa de origen (por ejemplo licitaciones, sitio web, diseños y proyectos con Drive), y retirar del registro los heredados antes de que algo dependa de ellos.
- Recomendación: b ya, y c antes de la 0.7. Es un cambio del registro y no reabre PP-DEC-04 ni PP-DEC-13; los módulos siguen a la carta, pero un ERP no debe depender de uno heredado.

### D-2. Dependencias de los ERP planeados

- Opción a: mantener las dependencias duras actuales.
- Opción b: dura solo la dependencia del modelo que se lee (facturación de productos; inventario de productos), lo demás en `integra` (BL-01a), y un puente declarado por pareja (compras con inventario, ventas con inventario, facturación con ventas) que se aplica cuando coexisten (BL-01b). El puente por pareja es diseño propio: el clon de Odoo solo muestra el mecanismo de instalación automática.
- Recomendación: b, antes de escribir el primer esquema ERP y junto con D-3, porque el tercero decide si facturación depende del CRM. La dependencia de facturación sobre productos solo se mantiene si el catálogo no queda atado a marcas (D-1). Falta fijar si ventas depende de `cotizador` o si la cotización pasa a ser parte de ventas (BL-59). Toca el registro, no las decisiones: los módulos siguen a la carta (PP-DEC-04) y planeados (PP-DEC-13).

### D-3. Terceros: dónde viven cliente y proveedor

- Opción a: compras, ventas y cartera declaran `depende: ['crm']` y el rol (cliente, proveedor) es una tabla satélite de `crm_cuentas` (BL-35). Compras exigiría el CRM entero, que aborta sin Vault y pgcrypto, arrastra MFA, permisos de salud y registro de accesos (PP-DEC-19), define la cuenta como persona atendida o empresa y exige una etapa de embudo.
- Opción b: las cuentas pasan al núcleo. Reabre PP-DEC-18, que las deja en el módulo `crm` con tablas `crm_*`.
- Opción c: terceros neutrales fuera del CRM (módulo o tabla del núcleo con rol cliente o proveedor), enlazables a `crm_cuentas`; el CRM es la vista comercial de ese tercero. No exige Vault, salud ni etapa, y no reabre PP-DEC-18.
- Recomendación: se decide junto con D-2; no se recomienda a mientras compras no pueda activarse sin el CRM y sin Vault. Una tienda o un taller que compra sin llevar CRM es el caso común, no la excepción. El glosario prohíbe «cliente» como nombre de la cuenta en el código: el término sería «rol del tercero» y hay que añadirlo al glosario.

### D-4. Oportunidad como entidad

- Opción a: la etapa sigue en la cuenta y no hay oportunidad.
- Opción b: `crm_oportunidades` aparte (monto con moneda, etapa, probabilidad, motivo de pérdida obligatorio) y la etapa de la cuenta se conserva como seguimiento de la persona atendida (BL-30).
- Opción c: mover la etapa de la cuenta a la oportunidad, con migración del primer cliente.
- Recomendación: b, diseñada ahora y construida al abrir la 0.8 o cuando un cliente venda a empresas. No toca al primer cliente ni PP-DEC-18: los catálogos de la oportunidad (etapas de venta, motivos de pérdida) viven en `instalacion.ajustes.crm`. Nombre propuesto: «etapa de venta» para la oportunidad; «Etapa» sin calificar sigue siendo la de la cuenta. Exige la entrada en el glosario.

### D-5. Nota crédito y cartera (pregunta abierta al usuario)

- La decisión cerrada global «Las notas crédito parciales no restan de la factura» (2026-10-14) se tomó para la Gerencia del portal de la empresa de origen. En la cartera por cruces de Odoo y ERPNext (BL-63) la nota crédito baja lo adeudado.
- Pregunta para el usuario: (a) la decisión no rige en Bash Logistics y la cartera cruza notas; (b) rige, y la nota queda fuera del saldo de la factura, con lo que BL-60 debe decir cómo la refleja el libro sin que deje de cuadrar; (c) se reabre (su condición de reapertura es «cambio contable del equipo», que no se ha cumplido).
- Sin recomendación: decisiones-cerradas pide no reproponerla. Hasta la respuesta, BL-63 cruza solo pagos y anticipos y BL-60 se lee como borrador en ese punto. El asesor contable del producto no está definido: hay que nombrarlo antes de la 0.9 (lo necesitan también D-11 y D-17).

### D-6. Facturas de Gerencia frente al módulo de facturación

- Opción a: el módulo `facturacion` reemplaza las tablas de Gerencia.
- Opción b: Gerencia lee del módulo nativo cuando está activo y del conector externo cuando no (`integra`).
- Recomendación: b. Mantiene a Gerencia útil para quien factura con un tercero y evita dos tablas de facturas en la misma instalación.

### D-7. Factura electrónica DIAN

- Ninguno de los cinco repos la trae (en Odoo es Enterprise).
- Opción a: proveedor tecnológico autorizado detrás del conector `facturacion`.
- Opción b: firma, CUFE, UBL 2.1 y envío propios.
- Recomendación: a. La b exige certificados, habilitación y mantenimiento normativo que no caben en la fase. La numeración se diseña igual para cualquiera de las dos: la serie (BL-05a) no depende de esta decisión; la asignación fiscal con resolución y vigencia (BL-05b) sí.

### D-8. Dónde corren las tareas programadas

- Opción a: `pg_cron` en Supabase para barridos que solo tocan la base.
- Opción b: funciones programadas de Netlify para lo que envía correo o push.
- Recomendación: las dos, según el caso. PP-DEC-03 admite ambas (no son servidores propios). La regla global de no dejar bucles de espera rige para las sesiones de IA, no para el producto. Falta comprobar que `pg_cron` esté disponible en el proyecto Supabase de cada cliente.

### D-9. El administrador ante los controles financieros y las prohibiciones

- Hoy `has_perm` da verdadero a un administrador por serlo. ERP-02 y ERP-11 piden que nadie se autoapruebe y que nadie, tampoco el administrador, publique en un periodo cerrado; PLA-11 propone prohibiciones explícitas. ERPNext permite la autoaprobación por defecto; ERP-02 la invierte.
- Opción a: el administrador pasa siempre.
- Opción b: en autoaprobación, periodo cerrado y prohibiciones, el administrador no pasa, con el mismo patrón de permiso explícito que ya usa salud (`crm_perm_explicito`, PP-DEC-19).
- Opción c: la autoaprobación se permite pero queda registrada y se configura por instalación; exige un segundo firmante solo si hay más de un aprobador.
- Recomendación: b para periodo cerrado y prohibiciones (BL-13, BL-69a, BL-69b) y c para autoaprobación (BL-57). Con el tope por defecto de 10 miembros (PP-DEC-15) el dueño suele ser el único administrador y el único aprobador, y con b las compras sobre el umbral quedarían bloqueadas. No contradice ninguna decisión.

### D-10. Numeración sin huecos: esperar o fallar

- El `no_gap` de `ir.sequence` en Odoo falla al instante si otro tiene la fila (`FOR UPDATE NOWAIT`); ERPNext espera (`FOR UPDATE` en `tabSeries`). Ninguno de los dos es la numeración de facturas de Odoo, que usa `sequence_mixin`.
- Recomendación: esperar con un `lock_timeout` corto y un error claro si se agota. Con equipos pequeños la espera es de milisegundos y un fallo inmediato confunde.

### D-11. Costo de inventario

- Opción a: costo promedio ponderado y fecha de bloqueo.
- Opción b: FIFO o por lote con reproceso hacia adelante, como ERPNext.
- Recomendación: a, y prohibir movimientos con fecha anterior a la fecha de bloqueo (BL-69a) en vez de reprocesar. Se confirma con el asesor contable al abrir la 0.7.

### D-12. Sedes o bodegas como ámbito de visibilidad

- La ficha de Odoo dice «ni siquiera una columna de sede»; ERP-22 y PLA-25 proponen ámbitos por sede o bodega.
- Recomendación: no hacerlo hasta que un cliente con varias sedes lo pida (BL-51). «Lo mío o sin asignar» (BL-11) cubre el caso común. No reabre PP-DEC-01: un ámbito no es una razón social. El mismo criterio rige para los festivos de BL-72 (por país, no por sede) y para la visibilidad por ascendencia de departamentos de BL-73.

### D-13. PDF de documentos

- Odoo usa wkhtmltopdf y ERPNext y Huly Chrome sin interfaz; ninguno corre bien en Netlify Functions.
- Opción a: CSS de impresión del navegador.
- Opción b: una biblioteca de PDF en servidor.
- Recomendación: a para cotización y pedido en la 0.8; b solo si la factura o el estado de cuenta en lote (BL-65) lo exigen en la 0.9.

### D-14. Orden y alcance de las fases 0.3 a 0.11

- Ninguna PP-DEC fija el plan ERP más allá de PP-DEC-13, y todo el calendario del backlog cuelga de él.
- Opción a: fijar una PP-DEC con el reparto que supone este análisis (0.7 inventario y compras, 0.8 ventas y pedidos, 0.9 facturación y cartera, 0.10 contabilidad, 0.11 RR. HH.) y dedicar 0.3 al primer lote y 0.4 a 0.6 a portar catálogo, cotizador y los módulos que D-1 deje como del producto.
- Opción b: decidir fase por fase al cerrar la anterior.
- Recomendación: a, como borrador para que el usuario lo ajuste: la cadena ERP no puede empezar sin el catálogo portado (huecos 1 y 2).

### D-15. ¿Multimoneda en el alcance?

- `instalacion.moneda_base` (COP) e `instalacion.divisas` ya existen; el conector `cambio` solo está declarado en `productos`, sin implementación.
- Opción a: una moneda por instalación. BL-08 se reduce a exigir el código junto al importe, con `moneda_base` por defecto, sin tasas.
- Opción b: multimoneda, con tasa por documento y quien la carga (TRM) definido.
- Recomendación: a hasta que un cliente facture en otra moneda. El par importe y código de BL-08 sigue valiendo: hace barata la b el día que llegue.

### D-16. Canales de salida del producto

- La decisión cerrada vigente (2026-11-17, WA-DEC-01 y 04) dice que WhatsApp va solo por la Cloud API oficial de Meta, también en el producto para terceros, y descarta Evolution API y Baileys. Ya no es un bloqueo sino una vía permitida, y de ella dependen BL-39, BL-40, BL-65 y BL-66.
- Opción a: correo y push solamente.
- Opción b: correo y push, más WhatsApp por Cloud API como canal opcional por instalación, con plantillas aprobadas por Meta y su costo por conversación avisado antes de activarlo.
- Recomendación: b desde la 0.9 (cobranza y estado de cuenta), con el costo avisado al cliente antes de activarlo. BL-19 solo arma el enlace para abrir el chat y no depende de esta decisión.

### D-17. Mercado y datos normativos

- Todo el contenido fiscal del backlog es colombiano (BL-61, BL-62, BL-68b, festivos de BL-38), pero ninguna PP-DEC dice que el producto sea solo colombiano y `instalacion.pais` y `crm_cuentas.pais` admiten otros países.
- A decidir: (a) mercado objetivo, solo Colombia o paquetes por país; (b) quién y cómo actualiza UVT, tarifas, PUC y festivos en cada instalación cuando cambian, si hay una base por cliente y no hay migraciones numeradas hasta la primera venta (PP-DEC-02); (c) confirmar que la contabilidad se construye (PP-DEC-13) y no se integra con el software contable del cliente.
- Recomendación: solo Colombia por ahora; los datos normativos como filas con vigencia que el instalador actualiza con un archivo de datos anual aparte del esquema; c se confirma con el asesor contable antes de abrir la 0.9, porque es la mayor apuesta del backlog.

### D-18. Datos sensibles de RR. HH.

- Las ausencias por incapacidad o licencia médica son datos de salud del empleado y el salario es dato sensible; PP-DEC-19 limita su régimen reforzado a las personas atendidas del CRM.
- Opción a: extender PP-DEC-19 a las ausencias por salud y a los salarios (cifrado, MFA, registro de accesos).
- Opción b: prohibir guardar el motivo médico en el tipo de ausencia (solo «incapacidad» con fechas) y tratar el salario con el permiso por campo de BL-43.
- Recomendación: b, más simple, antes de abrir la 0.11; se reabre si un cliente necesita el detalle médico.

### D-19. Dónde viven el plan de cuentas y los periodos

- BL-60 (0.9) valida cuenta habilitada y periodo abierto, pero las tablas de cuentas y periodos nacían en la 0.10, y en el registro `contabilidad` depende de `facturacion`, no al revés.
- Opción a: la tabla de cuentas y las cuentas por defecto (BL-68a) viven en `facturacion`; `contabilidad` las extiende con el PUC (BL-68b) y los periodos (BL-69b). La fecha de bloqueo global (BL-69a) va al núcleo.
- Opción b: un módulo contable base del que dependen `facturacion` y `contabilidad`.
- Recomendación: a. Evita un módulo más y respeta la dirección de dependencia actual (`modulos.ts`); se refleja en BL-01a.
