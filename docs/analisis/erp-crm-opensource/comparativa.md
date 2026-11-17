# Comparativa de cinco ERP y CRM de código abierto para TailorSuite

Síntesis de las fichas `odoo.md` (ODO-01 a 25), `erpnext.md` (ERP-01 a 25), `twenty.md` (TWE-01 a 21), `monica.md` (MON-01 a 21) y `platform.md` (Huly Platform, PLA-01 a 25), contrastadas con el estado del producto el 2026-11-17 (`main` en 0.2.16). Las 117 propuestas se fusionan y priorizan en `backlog.md`. No se volvieron a abrir los repos: las citas están en cada ficha. Licencias LGPL, GPL, AGPL y EPL: aquí solo hay ideas, ningún código.

## En resumen

- Ninguno de los cinco sirve como base: Odoo y ERPNext son la referencia de modelo de datos para inventario, compras, facturación, cartera y contabilidad; Twenty y Huly, de la mecánica transversal (permisos, vistas, flujos, esperas); Monica, de detalles del CRM.
- TailorSuite ya va por delante en el modelo de módulos (registro con dependencias, RLS restrictiva por módulo, una base por cliente) y en privacidad (salud cifrada con MFA y registro de accesos).
- Lo que más se repite entre repos y aún falta en el núcleo: numeración atómica en la base, estados de documento con transición atómica, aprobaciones, esperas programadas en Postgres y vistas guardadas en el servidor.
- El CRM 0.2 tiene cierres baratos de alto valor: duplicados, varios canales por cuenta, actividades con vencimiento, «lo mío o sin asignar», tipo de documento DIAN.
- Hueco serio del producto: nueve módulos figuran como `disponible` con un archivo de esquema que no existe; entre ellos `productos` y `cotizador`, de los que dependen los ERP planeados.
- Hay que decidir antes de la 0.7: dependencias blandas de los ERP, oportunidad como entidad, terceros (cliente y proveedor) sobre la cuenta del CRM y la nota crédito en cartera (decisión cerrada global).
- Tras fusionar quedan 73 propuestas (BL-01 a BL-73); el primer lote recomendado tiene 12.

## Tabla por dominio

Huly figura como «Huly» (carpeta `platform`). Twenty, Monica y Huly no tienen operaciones ni finanzas; Twenty, ERPNext (sin HRMS en el clon) y Monica no tienen RR. HH.

| Dominio | Odoo | ERPNext | Twenty | Monica | Huly | Mejor referencia para TailorSuite y por qué |
|---|---|---|---|---|---|---|
| Módulos y dependencias | Manifiesto con `depends`, puentes que se instalan solos cuando coexisten dos módulos e interruptores de función. | Lista plana sin dependencias: todo el esquema está siempre y activar es ocultar. | CRM fijo más «aplicaciones» por manifiesto, con identificador estable por fila sembrada y sin dependencias entre apps. | No hay módulos instalables; «módulo» es un bloque de la ficha de contacto. | Una fila de configuración enciende o apaga el módulo solo en la interfaz; los datos quedan. | Odoo, por los puentes y las dependencias mínimas (compras no exige inventario); de Twenty, el identificador estable y el dueño de cada fila sembrada. El registro de TailorSuite ya supera a los cinco en validación y RLS por módulo. |
| CRM y ventas | Lead aparte del tercero, ganado y perdido derivados de la etapa y del archivo, actividades con vencimiento, cotización y pedido en un documento. | Lead, Prospect y Customer separados, oportunidad bloqueada por sus cotizaciones, cotización con revisiones y pérdida con motivo obligatorio. | Oportunidad con etapa en kanban, duplicados declarativos, fusión que no pierde datos ocultos e historial que se funde por autor. | CRM de relaciones: varios canales tipados, relaciones con inverso, recordatorios recurrentes, línea de tiempo. | Lead como tarea sin monto; duplicados por canal antes de guardar; cliente como rol a demanda sobre el contacto. | Odoo para el modelo (oportunidad aparte, perdido como archivo con motivo, actividades programadas); Twenty y Huly para la calidad de datos (duplicados y fusión). |
| Operaciones | Movimientos entre ubicaciones con virtuales, saldo por producto, ubicación y lote con bloqueo, reposición mínimo-máximo sobre la proyección. | Libro de stock con saldo en caché, reorden contra la proyección, unidad y factor congelados por línea, conteo físico como documento. | — | — | El «inventario» es un catálogo con SKU, sin cantidades. | Odoo por el modelo de ubicaciones y saldo; ERPNext por la unidad congelada, el conteo físico y la recepción con rechazo. Ambos coinciden en calcular la proyección y no guardarla en el producto. |
| Finanzas | La factura es un asiento; cartera por cruces parciales; impuestos como filas; cierre por fecha de bloqueo con excepciones; plantilla colombiana de impuestos. | Libro mayor único con función de publicación, pagos con asignaciones, retenciones con vigencia, cierre por periodo y PUC verificado. | — | Solo préstamos con monto entero; no sirve. | — | Odoo para la estructura (documento único y cartera derivada, sin segundo libro que cuadrar); ERPNext para pagos, retenciones y cierre. Ninguno trae DIAN: factura electrónica, CUFE y UVT se diseñan desde la norma. |
| RR. HH. | Empleado con versiones fechadas, vista pública de solo lectura, ausencias declarativas con saldo desde asignaciones. | Solo el vínculo usuario-empleado y la regla de fila «mis reportes». | — | — | Departamentos en árbol, ausencias con factor firmado y festivos por departamento; la autorización vive solo en el cliente. | Odoo por la privacidad en dos capas y las versiones; de Huly, la simplicidad del factor firmado y el árbol de departamentos llevado a RLS. Nómina no está en ninguno. |
| Permisos | Grupos aditivos más restricciones globales, que se traducen casi uno a uno a políticas RLS permisivas y restrictivas; «lo mío o sin asignar». | Matriz por rol más reglas de fila separadas del rol, compartir puntual, nivel y máscara por campo, bitácora de cambios de permisos. | Objeto, campo (solo resta) y fila, banderas de función como exportar, historial depurado con lo que el lector no puede ver. | Nivel como entero ordenado, revalidación en cada servicio y guardas contra dejar la cuenta sin administrador. | Permisos como datos con prohibiciones y coincidencia sobre la operación; invitados con fallo cerrado. | Odoo, porque su fórmula es la de RLS; de Twenty, que el permiso de campo solo reste y que el historial lo respete; de Monica, la guarda del último administrador. |
| Extensibilidad | Campos reales con ALTER TABLE o Properties en JSONB; filtros guardados privados o compartidos. | Metamodelo DocType con DDL en caliente; vistas guardadas con dueño opcional y vistas estándar versionadas. | Todo es metadato con ALTER TABLE; opciones con clave inmutable y estado activo; vistas normalizadas con operandos por tipo. | Ficha armada por plantilla, páginas y bloques ordenables. | Campos en JSONB, registro de tipos con editor y filtro, vistas en tres capas, modos de fecha con nombre. | Twenty para catálogos y vistas (clave inmutable, operandos validados, fechas relativas); Huly para el registro de tipos de campo; Monica para la ficha por bloques. Ninguno con DDL en caliente: TailorSuite sigue con JSONB validado. |
| Automatización | Reglas con catálogo cerrado de disparadores, anti-recursión, cron con `SKIP LOCKED`, secuencias con y sin huecos. | Flujos de aprobación por datos, autorización por monto, motor con cola, numeración por plantilla; recurrencias que pierden el día. | Esperas durables en Postgres, versiones con una sola activa, fallos guardados como datos, cambio de estado atómico. | Recordatorios recurrentes con procesador que aísla cada fallo y canal que se apaga tras fallos. | Máquina de estados con control optimista, aprobación genérica, bloqueo durante la aprobación y temporizadores en una tabla. | Twenty para la ejecución (esperas, versiones, fallos como datos) y Huly para la forma (estados, aprobación, bloqueo); de ERPNext, la autorización por monto. Todo con catálogo cerrado de acciones, nunca código evaluado. |
| Integración | Importador con simulacro en savepoint e identificador externo; webhooks sin firma; portal con token. | Webhooks con HMAC, bitácora y reintento, bloqueo SSRF; importación por lotes con registro por fila y reanudación. | Llave API como fila con rol propio; webhook con rol que filtra eventos; exportación en segundo plano. | Estándares (vCard, iCal, CardDAV); webhook entrante que no provoca reintentos inútiles. | Tokens con vigencia y tope, exportación CSV y JSON, enlace público con restricciones, importación por modelo intermedio. | ERPNext para webhooks e importación; Twenty para credenciales con rol; Huly para el enlace público. El importador y el exportador del CRM ya resuelven lo que más importa en Colombia (BOM, `;`, fórmulas). |

## Patrones en los que coinciden varios

Cuando dos o más repos llegan por su lado a la misma solución, la señal es fuerte. Entre paréntesis, la BL que la recoge.

1. Numeración en la base, atómica, por serie con prefijo; sin huecos para lo fiscal: ODO-06, ERP-01; Huly lo hace en el navegador y su ficha lo desaconseja (BL-05).
2. Estados de documento cortos, transición atómica y avance derivado de las líneas: PLA-06, TWE-03, ODO-05, ODO-14, ERP-12 (BL-06, BL-07, BL-56).
3. Aprobación por umbral o genérica, con bloqueo mientras dura: ODO-07, ERP-02, PLA-05, PLA-03 (BL-45, BL-57).
4. Duplicados como aviso antes de guardar, no como bloqueo: ODO-19, ERP-15, TWE-05, PLA-01 (BL-18).
5. Fusión con lista cerrada de tablas hijas y en una transacción: TWE-17, PLA-21, ERP-15 (BL-31).
6. Actividades o tareas con vencimiento, responsable y estado calculado: ODO-10, MON-07, MON-03 (BL-22, BL-33).
7. Esperas y temporizadores en una tabla Postgres con reclamo atómico: TWE-07, PLA-07 (BL-38).
8. Un solo motor de reglas con catálogo cerrado, anti-recursión y registro de ejecuciones: ODO-25, ERP-18, TWE-18, PLA-16 (BL-46).
9. Vistas y filtros guardados en el servidor, privados o de equipo, con fechas relativas: ODO-20, ERP-20, TWE-08, PLA-08, PLA-02 (BL-24, BL-41).
10. Importación con simulacro, errores por fila e identificador externo: ODO-18, ERP-17, PLA-18, MON-17 (BL-44).
11. Exportar como permiso aparte de leer: ODO-08, PLA-04; también es bandera en Twenty (BL-12).
12. Permiso por campo que oculta costos y salarios, también en el historial: ERP-23, TWE-09, PLA-22 (BL-43).
13. Visibilidad por responsable o por ámbito, separada del rol: ODO-03, ERP-22, PLA-25 (BL-11, BL-51).
14. Varios canales de contacto como filas tipadas: MON-02, PLA-20 (BL-19).
15. Oportunidad como entidad aparte de la cuenta, con motivo de pérdida de catálogo: ODO-09, ERP-21; Twenty y Huly muestran el costo de no tenerla (BL-30).
16. Línea de tiempo única de la cuenta, escrita por la base y no a mano: MON-04, PLA-13, TWE-10 (BL-23, BL-28).
17. Catálogos con clave inmutable, nombre editable, estado activo y protección de lo que está en uso: TWE-11, MON-11, MON-08 (BL-15).
18. Plantillas con marcadores de una lista cerrada, sin código: TWE-13, PLA-15; Odoo tiene el mismo modo por expresión regular (BL-39).
19. Webhooks firmados con bitácora y reintento: ERP-25, TWE-16, MON-16 (BL-49, BL-66).
20. Credenciales de API con hash, vencimiento y alcance: PLA-19, MON-20, TWE-16 (BL-50).
21. Kanban por etapa con orden manual barato: TWE-19, PLA-14 (BL-32).
22. Campos propios generalizados con registro de tipos: ODO-22, PLA-23 (BL-42).
23. Reposición contra la existencia proyectada, que se calcula y no se guarda: ODO-15, ERP-03 (BL-55).
24. Inventario como libro de movimientos con saldo materializado y anulación por reverso: ODO-17, ERP-16 (BL-53).
25. Un solo documento contable con cuadre al publicar: ODO-11, ERP-05 (BL-60).
26. Cartera derivada del libro, sin tabla de saldos: ODO-12, ERP-06 (BL-63).
27. Impuestos y retenciones como filas con vigencia: ODO-13, ERP-08, ERP-09 (BL-61, BL-62).
28. Cierre por fecha o periodo con excepciones nominales: ODO-21, ERP-11 (BL-69).
29. Ausencias como tipos declarativos con saldo calculado: ODO-24, PLA-17 (BL-72).
30. Seguimiento de la propia cartera (seguidos, favoritos, frecuentes): PLA-12, MON-10 (BL-26).

## Dónde TailorSuite ya está igual o mejor

- **Registro de módulos.** `src/lib/modulos.ts` declara `depende` e `integra`, permisos, widgets, tablas, archivo de esquema y límites tipados, y valida activación y desactivación con cascada. ERPNext y Huly no tienen dependencias; Twenty solo un rango semver; Monica no tiene módulos.
- **Apagar un módulo apaga sus datos.** La política restrictiva `modulo_<slug>` bloquea las filas; ERPNext y Huly solo esconden el menú.
- **Una base por cliente con RLS** (PP-DEC-01). Monica, Huly y Twenty filtran la empresa en el código o en el ORM; un olvido expone datos.
- **Activa quien instala** (PP-DEC-04), con el script de service role; nadie instala módulos desde la interfaz del cliente, como sí permiten Odoo y Huly.
- **Autoría sellada por la base.** `crm_preparar` fija `created_by := auth.uid()` sin excepción; Twenty respeta un `createdBy` enviado con nombre.
- **Cuenta única persona o empresa**, con contactos aparte. Evita las tres entidades de ERPNext y el tercero único de Odoo.
- **Etapas con cierre** (`ganada`, `perdida`) en el catálogo de `crm_ajustes()`. Twenty no tiene etapa perdida y la etapa de ERPNext no tiene orden.
- **Historial por trigger** (`crm_cambios` con antes y después) y auditoría de roles (`auditar_cambio`). Monica escribe la línea de tiempo a mano en cada servicio.
- **Campos propios en JSONB validado** (`crm_campos_def`, `campos`), sin ALTER TABLE en caliente como Odoo, ERPNext y Twenty.
- **Datos de salud** (PP-DEC-19): cifrado con clave en Vault, MFA obligatorio, registro de accesos y nada en historial, búsqueda ni exportación. Ninguno de los cinco tiene algo comparable.
- **CSV para Excel en Colombia.** `src/modulos/crm/lib/csv.ts` escribe con BOM y `;`, detecta separador y neutraliza fórmulas con una excepción para números y teléfonos; Huly no pone BOM y Twenty usa un carácter de ancho cero.
- **Importador del CRM** con tope de 10 000 filas, alias de encabezados, plan por fila (crear, actualizar, error) y clave por documento normalizado; `crm_vinculos_externos` cumple el papel del identificador externo de Odoo.
- **Seguridad de base.** `roles_guard_escalada` impide otorgar lo que no se tiene; `api_rate_limits` da la cuota; `autorizacion.mts` declara requisitos por acción y niega un módulo desconocido; el núcleo no se desactiva; la pertenencia contacto-cuenta la comprueba la base (`crm_contacto_cuenta`).
- **El instalador falla cerrado** cuando falta el archivo de un módulo (sale con 2 sin escribir).

## Huecos del producto que el análisis destapó

Comprobados sobre el repo el 2026-11-17.

1. **Módulos `disponible` sin esquema ni pantalla.** El registro declara `10-calendario.sql`, `11-chat.sql`, `13-manuales.sql`, `20-proyectos.sql`, `22-catalogo.sql`, `23-cotizador.sql`, `26-gerencia.sql`, `27-licitaciones.sql` y `28-sitio-web.sql`, y `supabase/esquema` solo tiene `00` a `09`, `21-crm.sql` y `21b-crm-consentimiento-reloj.sql`. En `src/modulos/` solo existe `crm`. `docs/modulos.md` los muestra como disponibles. El instalador no se rompe (sale con 2 y no escribe), pero el registro, que es la fuente única (PP-DEC-04), dice algo que no es cierto.
2. **La cadena de los ERP cuelga de módulos sin portar.** Inventario depende de `productos` y ventas de `cotizador`, y ninguno de los dos tiene esquema. Antes de la 0.7 hay que portar el catálogo o cambiar esas dependencias. La unidad base y el factor (BL-52) también van en el catálogo.
3. **Dependencias duras al revés de lo que hacen Odoo y ERPNext.** Ventas exige inventario, facturación exige ventas y compras, contabilidad exige inventario. Una pyme de servicios no podría facturar sin activar compras e inventario.
4. **Choque de nombres.** `cotizador` declara la tabla `crm_clients`, con el prefijo del módulo CRM nativo, y su política restrictiva sería `modulo_cotizador` sobre una tabla `crm_*`. Con el CRM nativo, el cotizador debería leer `crm_cuentas` (ya declara `integra: ['crm']`).
5. **Dos fuentes de facturas por venir.** Gerencia declara `facturas`, `factura_lineas` y `factura_vinculos` alimentadas por el conector `facturacion`; el módulo `facturacion` planeado tendrá las suyas. No hay decisión sobre cuál manda.
6. **Sin guarda del último administrador.** No hay ninguna en `supabase/esquema` (búsqueda por «último» y «last_admin» sin resultados relevantes) y la política de borrado de `user_roles` deja a un administrador quitarse su propio rol.
7. **CRM con un solo teléfono y un solo correo** por cuenta y por contacto, y `documento` sin tipo DIAN ni dígito de verificación aparte.
8. **`crm_actividades` es solo registro de lo hecho**: sin vencimiento, responsable ni estado; no hay recordatorios.
9. **Visibilidad total dentro del CRM.** Quien tiene `app_crm` ve todas las cuentas (`crm_cuentas_select` usa `puede_ver_app('crm')`) y lee todo `crm_cambios`.
10. **Exportar no es un permiso.** `Exportar.tsx` no comprueba ninguno propio: basta poder leer.
11. **Catálogos con etiqueta como valor.** Orígenes, tipos de empresa, relaciones y opciones de `crm_campos_def` son textos sueltos; renombrar uno deja huérfanos los registros. Las etiquetas son texto libre.
12. **Sin `updated_by` ni `origen`** en las tablas del CRM, y sin control de edición concurrente: las actualizaciones de `src/modulos/crm/lib/datos.ts` no comparan `updated_at`.
13. **Ajustes sin forma declarada.** `instalacion.ajustes.crm` solo lo entiende `crm_ajustes()`; el registro tipa los límites pero no los ajustes.
14. **Ninguna pieza transversal para los ERP**: ni numeración, ni transición de estados, ni aprobaciones, ni tabla de tareas programadas, ni vistas guardadas en el servidor (los filtros del CRM viven en la URL).
15. **El orden de las fases 0.3 a 0.6 no está escrito.** Las fases 0.7 a 0.11 se asignan aquí según el reparto pedido: 0.7 inventario y compras, 0.8 ventas y pedidos, 0.9 facturación y cartera, 0.10 contabilidad, 0.11 RR. HH.

## Decisiones que habría que tomar o reabrir

### D-1. Estado de los módulos sin esquema

- Opción a: dejarlos como `disponible`; el instalador ya falla cerrado.
- Opción b: marcarlos `planeado` (o un estado nuevo «por portar») hasta que llegue su archivo, con una prueba que exija que todo módulo `disponible` con `sql` tenga su archivo en `supabase/esquema`.
- Recomendación: b. Es un cambio del registro, no reabre PP-DEC-04 ni PP-DEC-13, y evita que la documentación generada mienta.

### D-2. Dependencias de los ERP planeados

- Opción a: mantener las dependencias duras actuales.
- Opción b: dura solo la dependencia del modelo que se lee (facturación de productos y CRM; inventario de productos), lo demás en `integra`, y un puente declarado por pareja (compras con inventario, ventas con inventario, facturación con ventas) que se aplica cuando coexisten (BL-01).
- Recomendación: b, antes de escribir el primer esquema ERP. Toca el registro, no las decisiones: los módulos siguen a la carta (PP-DEC-04) y planeados (PP-DEC-13).

### D-3. Terceros: dónde viven cliente y proveedor

- Opción a: compras, ventas y cartera declaran `depende: ['crm']` y el rol (cliente, proveedor) es una tabla satélite de `crm_cuentas` (BL-35).
- Opción b: las cuentas pasan al núcleo. Reabre PP-DEC-18, que las deja en el módulo `crm` con tablas `crm_*`.
- Recomendación: a. Solo valdría b si un cliente quiere compras sin CRM. El glosario prohíbe «cliente» como nombre de la cuenta en el código: el término sería «rol de la cuenta» y hay que añadirlo al glosario.

### D-4. Oportunidad como entidad

- Opción a: la etapa sigue en la cuenta y no hay oportunidad.
- Opción b: `crm_oportunidades` aparte (monto con moneda, etapa, probabilidad, motivo de pérdida) y la etapa de la cuenta se conserva como seguimiento de la persona atendida (BL-30).
- Opción c: mover la etapa de la cuenta a la oportunidad, con migración del primer cliente.
- Recomendación: b, diseñada ahora y construida al abrir la 0.8 o cuando un cliente venda a empresas. No toca al primer cliente ni PP-DEC-18 (los catálogos siguen en ajustes). Exige una entrada nueva en el glosario: «Etapa» pasa a tener dos sentidos, o la de la oportunidad se llama distinto.

### D-5. Nota crédito y cartera (decisión cerrada global)

- La decisión «Las notas crédito parciales no restan de la factura» (2026-10-14, ajuste-estandares-2026-10) choca con la cartera por cruces de Odoo y ERPNext (BL-63): ahí la nota crédito baja lo adeudado.
- Opción a: mantenerla también en el producto; la cartera se limita a pagos y anticipos.
- Opción b: reabrirla solo para TailorSuite, con el contador. La condición de reapertura es «cambio contable del equipo»; la decisión nació de la práctica contable de la empresa de origen, no de una cartera de clientes de una pyme.
- Recomendación: b. En un libro único, una nota crédito que no resta deja la cartera inflada. Se decide al abrir la 0.9, con el contador.

### D-6. Facturas de Gerencia frente al módulo de facturación

- Opción a: el módulo `facturacion` reemplaza las tablas de Gerencia.
- Opción b: Gerencia lee del módulo nativo cuando está activo y del conector externo cuando no (`integra`).
- Recomendación: b. Mantiene a Gerencia útil para quien factura con un tercero y evita dos tablas de facturas en la misma instalación.

### D-7. Factura electrónica DIAN

- Ninguno de los cinco repos la trae (en Odoo es Enterprise).
- Opción a: proveedor tecnológico autorizado detrás del conector `facturacion`.
- Opción b: firma, CUFE, UBL 2.1 y envío propios.
- Recomendación: a. La b exige certificados, habilitación y mantenimiento normativo que no caben en la fase. La numeración (BL-05) se diseña igual para cualquiera de las dos: rango y vigencia de la resolución.

### D-8. Dónde corren las tareas programadas

- Opción a: `pg_cron` en Supabase para barridos que solo tocan la base.
- Opción b: funciones programadas de Netlify para lo que envía correo o push.
- Recomendación: las dos, según el caso. PP-DEC-03 admite ambas (no son servidores propios). La regla global de no dejar bucles de espera rige para las sesiones de IA, no para el producto.

### D-9. El administrador ante los controles financieros y las prohibiciones

- Hoy `has_perm` da verdadero a un administrador por serlo. ERP-02 y ERP-11 piden que nadie se autoapruebe y que nadie, tampoco el administrador, publique en un periodo cerrado; PLA-11 propone prohibiciones explícitas.
- Opción a: el administrador pasa siempre.
- Opción b: en autoaprobación, periodo cerrado y prohibiciones, el administrador no pasa, con el mismo patrón de permiso explícito que ya usa salud (`crm_perm_explicito`, PP-DEC-19).
- Recomendación: b, limitada a esa lista. No contradice ninguna decisión.

### D-10. Numeración sin huecos: esperar o fallar

- Odoo falla al instante si otro tiene la fila; ERPNext espera.
- Recomendación: esperar con un `lock_timeout` corto y un error claro si se agota. Con equipos pequeños la espera es de milisegundos y un fallo inmediato confunde.

### D-11. Costo de inventario

- Opción a: costo promedio ponderado y cierre de periodo.
- Opción b: FIFO o por lote con reproceso hacia adelante, como ERPNext.
- Recomendación: a, y prohibir movimientos con fecha anterior al último cierre en vez de reprocesar. Se confirma con el contador al abrir la 0.7.

### D-12. Sedes o bodegas como ámbito de visibilidad

- La ficha de Odoo dice «ni siquiera una columna de sede»; ERP-22 y PLA-25 proponen ámbitos por sede o bodega.
- Recomendación: no hacerlo hasta que un cliente con varias sedes lo pida (BL-51). «Lo mío o sin asignar» (BL-11) cubre el caso común. No reabre PP-DEC-01: un ámbito no es una razón social.

### D-13. PDF de documentos

- Odoo usa wkhtmltopdf y ERPNext y Huly Chrome sin interfaz; ninguno corre bien en Netlify Functions.
- Opción a: CSS de impresión del navegador.
- Opción b: una biblioteca de PDF en servidor.
- Recomendación: a para cotización y pedido en la 0.8; b solo si la factura o el estado de cuenta en lote (BL-65) lo exigen en la 0.9.
