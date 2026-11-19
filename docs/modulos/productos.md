# Módulo Productos (fase 0.7): diseño

Documento que siguen los implementadores del módulo `productos`. No es SQL ejecutable ni código: fija el modelo, los permisos, las funciones, las pantallas, las pruebas y el plan de archivos. Redactado el 2026-11-19 sobre la rama `pruebas/fase-0.7` (último paso 0.7.1, de8b129) y revisado el mismo día con las objeciones de dos críticos (sección 11). Lo que este documento no decide y es del usuario está en la sección 9.

## Cómo leer

| Si eres… | Lee |
|---|---|
| Quien escribe `22-catalogo.sql` | 1, 2, 3, 4 y 10 |
| Quien escribe las pantallas | 1, 3 (permisos), 4 (firmas), 5 y 7 |
| Quien escribe las pruebas | 6 y 7 |
| Quien revisa | 1, 8, 9, 10 y 11 |
| El usuario | 1 y 9 |

## Reglas para agentes

- El archivo de esquema es uno solo, `supabase/esquema/22-catalogo.sql`, idempotente y con bloque 0 de requisitos y bloque final de verificación que aborta, como `21-crm.sql`.
- «Aplicado» significa registrado por `tools/instalar/aplicar.mjs` en `esquema_aplicado` de la base de pruebas compartida, con su sha256. Desde ese momento el archivo no se edita y un cambio va en `22b-…` (PP-DEC-02). Antes de aplicarlo, el archivo se itera con `tools/instalar/ensayar.mjs --simular` (paso 2 de la sección 7): aplica lo pendiente y la simulación de permisos en una sola transacción que se deshace, sin registrar la huella. Se aplica solo cuando la sección 19 de la simulación sale entera en OK.
- Nada del portal de origen se copia sin neutralizar: ni marcas, ni voltajes, ni monedas fijas, ni textos del rubro. Lo que se porte se anota en `docs/origen.md` con el hash de team-portal que se lea en ese momento (sección 8).
- Toda tabla nueva aplica el contrato (`contrato_aplicar`) salvo las exentas de la sección 2; todo importe va como par (`public.importe` y `<col>_moneda public.codigo_moneda`) con su check de pareja. Ninguna columna `numeric` lleva un nombre que empiece por una palabra de dinero (`NOMBRE_DINERO` de `contrato-tabla.test.ts`): por eso el porcentaje se llama `porcentaje` y `porcentaje_impuesto`.
- Ninguna función `security definer` fuera de las dos de la sección 4.1. Cada función lleva `set search_path = public, pg_temp`, `revoke … from public, anon` y su grant explícito.
- Las pantallas no llevan leyendas explicativas ni emojis (decisiones cerradas); ningún campo se deshabilita con el motivo escondido en un título; todo `<input>` y `<textarea>` lleva `autoComplete="off"` y los `placeholder` son ejemplos inventados y neutros.
- Las decisiones de la sección 9 marcadas «antes del paso 2» las responde el usuario antes de escribir `22-catalogo.sql`. Las demás se implementan con la opción recomendada mientras el usuario no diga otra cosa, porque su cambio posterior es barato, y se anotan como PP-DEC al cerrar el paso.

## 1. En resumen y alcance

> **En resumen.** Seis tablas de negocio y configuración con prefijo `productos`: el producto, sus categorías en árbol, el catálogo de unidades con clave inmutable, las conversiones de cada producto a sus unidades alternas, el catálogo de clases de impuesto con clave inmutable y un historial único de todo ello; más un registro interno de las tablas de líneas que cuentan productos. El código del producto es único para siempre (archivados incluidos), se normaliza en la base y, si llega vacío, lo pone una serie con huecos. El precio de lista es un par importe y moneda, por unidad base, en la moneda base de la instalación. La unidad base no cambia una vez que el producto tiene conversiones, precio o líneas en cualquier módulo. Dos permisos: ver y editar; las clases de impuesto las edita solo un administrador. Lo leen también los usuarios de los módulos que dependen del catálogo. Importación por lotes en una función de base con simulacro que no gasta números; exportación paginada en el navegador con el permiso de lectura.

### Qué entra

| Pieza | Qué es |
|---|---|
| Producto | Código, nombre, descripción, tipo (bien o servicio), categoría, unidad base, clase de impuesto, precio de lista por unidad base (par), se vende y se compra (decisión 9.6), activo o archivado |
| Categorías | Árbol de categorías propio de la instalación, hasta tres niveles, con nombre editable y archivo |
| Unidades | Catálogo de unidades con clave inmutable, nombre, símbolo y decimales admitidos; sembrado con un juego básico |
| Unidades alternas | Por producto: unidad y factor de conversión a la unidad base («1 caja = 12 und») |
| Impuesto por defecto | Cada producto apunta a una clase de impuesto de un catálogo con clave inmutable; la clase es la plantilla que Facturación desarrollará (sección 2.7). El motor que calcula impuestos en un documento no se construye aquí |
| Contrato de líneas | `productos_aplicar_linea`: la función con la que Inventario, Compras, Ventas y Facturación crean sus líneas con unidad, factor y copias congeladas |
| Historial | Cambios del producto, sus conversiones y los tres catálogos, con antes y después, escrito solo por trigger |
| Importador CSV | Alta y actualización por código desde un CSV, con vista previa, simulacro en la base y reporte de errores |
| Exportador CSV | Lista filtrada en un CSV reimportable, armada en el navegador con la búsqueda paginada |

### Qué queda fuera y por qué

| Fuera | Por qué | Cómo queda la puerta abierta |
|---|---|---|
| Lotes y seriales | Son del inventario: nacen con un movimiento, no con el producto | Inventario añade `seguimiento` (ninguno, lote, serie) con valor por defecto `ninguno`; un `add column` con defecto no reescribe datos. El nombre `lotes` queda libre (no se porta `product_lotes`, que en el origen eran lotes de importación) |
| Variantes | Ningún cliente las pidió y multiplican códigos, precios y existencias | Si llegan, `productos` pasa a ser la plantilla y `productos_variantes` lleva su propio código; las líneas ya guardan `producto_id` y añadirán `variante_id` nulo por `productos_aplicar_linea`. El riesgo de unicidad de códigos entre las dos tablas está en la sección 10 |
| Listas de precios por cliente | Dependen del tercero (D-3) y de Ventas | `precio_lista` es la lista general; una lista por cliente será `productos_listas` más sus ítems con el mismo par importe y moneda, por unidad base |
| Precio propio por unidad alterna | No está en el alcance | Columnas nulas `precio` y `precio_moneda` (mismo par) en `productos_conversiones` cuando se pida; mientras tanto la línea propone `precio_lista * factor` (2.6) |
| Costo y costo promedio | Los calcula el inventario por movimientos (D-11) | El catálogo no guarda costo; cuando exista, irá con permiso por campo (BL-43) |
| Código de barras | No está en el alcance fijado | Tabla hija `productos_codigos` (código, tipo, unidad) cuando un cliente con punto de venta lo pida |
| Fotos y documentos del producto | No están en el alcance y consumen almacenamiento del plan | Un bucket privado propio cuando se pidan |
| Atributos técnicos y campos propios | Los generaliza BL-42 para todos los módulos | Columna `campos jsonb` con definición, como `crm_campos_def`, cuando llegue BL-42 |
| Marcas y tasas por marca | Son del rubro de la empresa de origen | No se portan (D-1, D-2) |
| Motor de impuestos y retenciones | Es de Facturación (BL-61, BL-62, fase 0.9) | La clase de impuesto del producto, su tipo bien o servicio y la copia en las líneas son las entradas que ese motor necesita (2.7) |
| Multimoneda | Una moneda por instalación (PP-DEC-24, D-15 opción a) | El precio ya es un par: cambiar de moneda no migra columnas |
| Máquina de estados | Un producto no es un documento: solo está activo o archivado | `archivado_en` del contrato; la máquina (PP-DEC-26) la usa el primer documento de Inventario o Compras |
| Factores globales entre magnitudes físicas | Con conversiones por producto alcanza para empezar | Se reabre con el primer cliente con muchos productos a granel: el factor entre magnitudes físicas (kg, g, lb, t, l, ml) podría ser global y el de empaque (caja, paquete) seguir por producto (sección 10) |

### Decisiones técnicas que fija este diseño

Se registran como PP-DEC al implementarse; no son del usuario.

1. Unidades, impuestos y categorías van en tablas y no en `instalacion.ajustes` (como los catálogos del CRM): los referencian por llave foránea el producto y las líneas de cada documento, y solo una llave con `on delete restrict` garantiza que una clave en uso no se borra.
2. El catálogo lo leen quienes ven Productos y quienes ven un módulo que depende directamente de él (`productos_puede_leer()`, sección 3.2).
3. El código es único entre todos los productos, también los archivados, mientras el usuario no diga otra cosa (decisión 9.3).
4. La importación decide crear, actualizar o sin cambio en la base, no en el navegador (sección 4.3), a diferencia del CRM de hoy: con un catálogo grande el navegador no puede bajar todos los códigos, y así se adelanta la dirección de BL-44. Los repetidos dentro del archivo los detecta el navegador sobre el archivo entero, antes de partirlo.
5. El precio de lista es por unidad base. La unidad base no cambia si el producto tiene conversiones, precio de lista o líneas en cualquier tabla registrada (2.4 y 2.6).
6. Las líneas de los documentos se crean con `productos_aplicar_linea`, que añade las columnas, las llaves y el trigger que congela código, nombre, unidad, factor y, si la línea lleva impuesto, la clase y su porcentaje. Lo vigila la comprobación 24 de `verificar.sql` (2.6).
7. El factor de conversión es 1 o mayor, o el inverso de un entero (`0.001` sí, `0.083333` no): la base es la unidad menor en la que se cuenta el producto, y así todo factor guardado es exacto (2.5).
8. Un solo permiso de edición para productos, categorías y unidades; las clases de impuesto, solo un administrador (3.1).
9. Tres niveles de categorías como máximo (2.3).
10. Exportar no es un permiso propio: quien lee el catálogo ya lo recorre por la API, así que un permiso de exportación no cerraría nada (3.1).
11. Un solo historial, `productos_cambios`, para el producto, sus conversiones y los tres catálogos; sobrevive al borrado del producto (2.8).

## 2. Modelo de datos

Todas las tablas viven en `public`, con RLS, la política restrictiva `modulo_productos` (`aplicar_politica_modulo`) y `exigir_mfa` (`aplicar_exigir_mfa()` al final del archivo). Se crean en este orden por sus llaves: unidades, impuestos, categorías, productos, conversiones, historial y registro de líneas.

### 2.1 `productos_unidades`

Catálogo de unidades de la instalación. Clave inmutable (BL-15a), nombre editable.

| Columna | Tipo | Restricción | Por qué |
|---|---|---|---|
| `clave` | `text` | PK; check `^[a-z][a-z0-9_]{0,19}$` | Es lo que guardan el producto y cada línea de documento. Corta y legible en un CSV (`und`, `kg`, `caja`) |
| `nombre` | `text not null` | check `char_length(btrim(nombre)) between 1 and 40` | Lo que ve la pantalla; se puede corregir sin tocar los datos |
| `simbolo` | `text` | check `simbolo is null or char_length(simbolo) <= 10` | Para columnas estrechas y para imprimir |
| `decimales` | `smallint not null default 0` | check `decimales between 0 and 6` | Cuántos decimales admite una cantidad en esta unidad (`und` 0, `kg` 3). Lo usarán los documentos al validar cantidades; aquí solo se guarda. La idea es `must_be_whole_number` de ERPNext, ampliada a un número de decimales |
| `codigo_dian` | `text` | check `codigo_dian is null or codigo_dian ~ '^[A-Z0-9]{1,3}$'` | Código de unidad de la factura electrónica. Queda nulo: la lista vigente la fija el anexo técnico de la DIAN y la carga Facturación (0.9), verificada, no copiada. No la escribe la API (grants abajo) |
| `sistema` | `boolean not null default false` | | La unidad que el producto usa por defecto (`und`) no se borra ni se archiva. No la escribe la API |
| contrato | | `contrato_aplicar('public.productos_unidades')` | Autoría, fechas y `archivado_en`: una unidad archivada deja de ofrecerse en productos y líneas nuevas, pero los que la usan la conservan |

- Grants por columna, como `series`: `insert (clave, nombre, simbolo, decimales, archivado_en, creado_via)` y `update (nombre, simbolo, decimales, archivado_en)` a `authenticated`. `sistema` y `codigo_dian` solo los escriben el dueño (el archivo del módulo) y, en la 0.9, el archivo de Facturación. Un intento por la API da `42501`, también para un administrador.
- Trigger `productos_clave_inmutable` (BEFORE UPDATE OR DELETE): rechaza cambiar `clave` (pista `productos_clave_inmutable`, 23514) y borrar o archivar una fila con `sistema` (pista `productos_sistema`, 23514). Que una clave en uso no se borre lo garantizan las llaves con `on delete restrict` (23503); el trigger da el mensaje claro solo para lo que la llave no cubre.
- Semilla con `on conflict (clave) do nothing` (no pisa lo editado): `und` Unidad (0 decimales, sistema), `kg` Kilogramo (3), `g` Gramo (0), `l` Litro (3), `ml` Mililitro (0), `m` Metro (2), `m2` Metro cuadrado (2), `m3` Metro cúbico (3), `h` Hora (2), `caja` Caja (0), `paquete` Paquete (0), `docena` Docena (0). Las de empaque no traen factor: el factor es de cada producto (2.5).
- Índice único `productos_unidades_nombre_unico` sobre `lower(btrim(nombre))` entre las no archivadas: dos unidades con el mismo nombre confunden el selector.

### 2.2 `productos_impuestos`

Catálogo de clases de impuesto. El producto no guarda una tarifa sino la clase a la que pertenece; la tarifa vive en la clase. Es la idea de la plantilla de impuesto por ítem de ERPNext (`item_tax_template`) reducida a lo mínimo: hoy una clase describe un impuesto; en la 0.9 la clase puede pasar a tener varios componentes (por ejemplo IVA más INC) sin cambiar la columna del producto (2.7).

| Columna | Tipo | Restricción | Por qué |
|---|---|---|---|
| `clave` | `text` | PK; check `^[a-z][a-z0-9_]{0,29}$` | Lo que guardan el producto y las líneas. Neutra: no lleva la tarifa en el nombre, para que siga siendo verdad si la norma cambia |
| `nombre` | `text not null` | check 1 a 60 caracteres | «IVA general», «Exento» |
| `tipo` | `text not null` | check `tipo in ('iva', 'inc', 'otro')`; inmutable tras el alta | IVA o impuesto nacional al consumo: se liquidan distinto y la factura electrónica los separa |
| `tratamiento` | `text not null` | check `tratamiento in ('gravado', 'exento', 'excluido')`; inmutable tras el alta | Exento (tarifa 0 con derecho a descontar) y excluido (fuera del impuesto) no son lo mismo, aunque ambos cobren 0. Un tratamiento distinto es otra clase |
| `porcentaje` | `numeric(7,4) not null default 0` | check `porcentaje between 0 and 100`; check `tratamiento = 'gravado' or porcentaje = 0` | Tarifa en porcentaje. Se llama `porcentaje` y no `tarifa_pct`: `NOMBRE_DINERO` de `contrato-tabla.test.ts` incluye `tarifa` y rechazaría un `numeric` con ese prefijo. Editable: las líneas copian el porcentaje al crearse (2.6) |
| `predeterminado` | `boolean not null default false` | índice único parcial `where predeterminado and archivado_en is null` | La clase que toma un producto que se crea sin ella; exactamente una activa (trigger de abajo) |
| contrato | | `contrato_aplicar('public.productos_impuestos')` | `archivado_en`: una clase archivada no se ofrece en productos ni líneas nuevas |

- Sin columna `sistema`: una clase en uso no se borra por la llave `restrict`, y la predeterminada no se archiva por la regla de abajo. No hace falta otra protección.
- Mismo trigger `productos_clave_inmutable` que las unidades, que además rechaza cambiar `tipo` o `tratamiento` (pista `productos_clase_inmutable`, 23514).
- Trigger de restricción `productos_impuestos_predeterminado` (`constraint trigger` AFTER INSERT OR UPDATE OR DELETE, `deferrable initially deferred`, invoker): al confirmar la transacción exige exactamente una clase activa con `predeterminado` (pista `productos_sin_predeterminado`, 23514). Así no se puede desmarcar la única ni archivarla. El cambio de predeterminada se hace con `productos_impuesto_predeterminar` (4.6), que desmarca y marca en la misma transacción.
- Semilla (`on conflict do nothing`), con claves neutras y tarifas colombianas como datos editables: `iva_general` IVA general (gravado, 19, predeterminado), `iva_reducido` IVA reducido (gravado, 5), `iva_exento` Exento de IVA (exento, 0), `iva_excluido` Excluido de IVA (excluido, 0). Las tarifas las confirma el asesor contable antes de entregar la instalación. Que la semilla salga del esquema o de un archivo de datos por país, y si se siembra el INC, lo decide el usuario (decisión 9.7, D-17); con las claves neutras, una instalación de otro país edita nombre y porcentaje y archiva lo que no usa.
- Hasta Facturación, `porcentaje` solo se muestra en pantallas y se copia en las líneas. La 0.9 decide si la tarifa con vigencia va a una tabla hija (`productos_impuestos_tarifas`, clave y `vigente_desde`) o a sus propias plantillas (BL-61): la clave de la clase es el contrato estable, la tarifa no.

### 2.3 `productos_categorias`

Árbol de categorías. Se referencia por `id`, no por clave: el nombre se edita libremente y nadie lo guarda copiado.

| Columna | Tipo | Restricción | Por qué |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` | |
| `nombre` | `text not null` | check `char_length(btrim(nombre)) between 1 and 80 and position('/' in nombre) = 0` | Sin `/`: el CSV escribe la ruta como «Herramientas / Manuales» y la importación la vuelve a partir |
| `padre_id` | `uuid` | FK a `productos_categorias(id) on delete restrict`; check `padre_id is distinct from id` | El árbol. `restrict`: borrar una categoría con hijas falla en lugar de dejarlas sueltas |
| `orden` | `int not null default 0` | | Orden manual entre hermanas |
| contrato | | `contrato_aplicar('public.productos_categorias')` | `archivado_en`: una categoría archivada no se ofrece al elegir |

- Índice único `productos_categorias_nombre_unico` sobre `(coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nombre)))` entre las no archivadas: dos hermanas con el mismo nombre harían ambigua la ruta del CSV.
- Índice `productos_categorias_padre_idx` sobre `padre_id`.
- Trigger `productos_categorias_validar` (BEFORE INSERT OR UPDATE, invoker):
  1. En el alta o si cambian `padre_id` o `archivado_en`, toma `pg_advisory_xact_lock(hashtext('public.productos_categorias'))`. Las escrituras del árbol son pocas; serializarlas evita que dos movimientos simultáneos (A bajo B y B bajo A) pasen los dos la comprobación de ciclo, que lee el estado confirmado.
  2. Rechaza un padre que sea la propia fila o un descendiente suyo (pista `productos_categoria_ciclo`, 23514).
  3. Rechaza que la profundidad del nuevo padre más la altura del subárbol de la fila pase de 3 niveles (pista `productos_categoria_profundidad`, 23514): mover «Herramientas» con dos niveles de hijas bajo una categoría de nivel 2 falla, no solo la fila movida.
  4. Rechaza un padre archivado y archivar una categoría con hijas activas (pista `productos_categoria_con_hijas`). Archivar una categoría con productos sí se admite: los productos la conservan y la pantalla la muestra como archivada.
- Toda consulta recursiva sobre el árbol (subcategorías en `productos_buscar`, ruta y altura en el trigger) usa `union` (no `union all`) y un tope de nivel (`where nivel < 10`): aunque un dato corrupto dejara un ciclo, la consulta termina.

### 2.4 `productos`

| Columna | Tipo | Restricción | Por qué |
|---|---|---|---|
| `id` | `uuid` | PK | Lo que referencian las líneas |
| `codigo` | `text not null` | check `codigo ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'` (según la decisión 9.2); índice único `productos_codigo_unico` sobre `codigo`, sin condición (según la decisión 9.3) | Ver «Código» abajo |
| `nombre` | `text not null` | check `char_length(btrim(nombre)) between 1 and 200` | |
| `descripcion` | `text` | check `descripcion is null or char_length(descripcion) <= 4000` | Texto libre para el documento |
| `tipo` | `text not null default 'bien'` | check `tipo in ('bien', 'servicio')` | Lo necesitan la retención en la fuente (compras de bienes frente a servicios, BL-62) y el inventario (un servicio no mueve existencias) |
| `vendible`, `comprable` | `boolean not null default true` | | Decisión 9.6: un insumo no aparece en el selector de Ventas ni un servicio que solo se presta en el de Compras. Las filtra `productos_buscar` con `p_uso` |
| `categoria_id` | `uuid` | FK a `productos_categorias(id) on delete restrict` | Nula admitida: un catálogo recién importado no tiene por qué estar clasificado |
| `unidad_base` | `text not null default 'und'` | FK a `productos_unidades(clave) on delete restrict` | La unidad en la que el producto se cuenta y a la que se refieren el precio de lista y todo factor (BL-52, ERP-04). Es la unidad menor en la que se cuenta (decisión técnica 7) |
| `impuesto` | `text not null` | FK a `productos_impuestos(clave) on delete restrict` | La clase por defecto; si llega nula en el alta, el trigger pone la predeterminada |
| `precio_lista` | `public.importe` | check `precio_lista is null or precio_lista >= 0` | Precio general de venta **por unidad base**, sin impuestos (decisión 9.4). Nulo: sin precio publicado |
| `precio_lista_moneda` | `public.codigo_moneda` | check de pareja `productos_precio_lista_moneda_check` `((precio_lista is null) = (precio_lista_moneda is null))` | PP-DEC-24. El trigger la pone con `instalacion.moneda_base` |
| contrato | | `contrato_aplicar('public.productos')` | `created_by`, `updated_by`, `created_at`, `updated_at`, `creado_via` (la importación declara `importacion`) y `archivado_en` (activo o archivado) |

Índices, además del único de código:

- `productos_codigo_trgm` y `productos_nombre_trgm`: gin con `extensions.gin_trgm_ops`, para el `ilike` de la búsqueda. El archivo crea `pg_trgm` en `extensions` si falta y aborta si está en otro esquema, igual que `21-crm.sql`: Productos se activa sin el CRM.
- `productos_categoria_idx` sobre `categoria_id`; `productos_unidad_idx` sobre `unidad_base` e `productos_impuesto_idx` sobre `impuesto` (las llaves con `restrict` buscan por ellas al borrar una unidad o una clase).
- `productos_activos_nombre_idx` sobre `(nombre, id) where archivado_en is null`: el orden por defecto de la lista.

**Código.**

- Normalización (decisión 9.2, opción recomendada), en el trigger `productos_preparar` y, con la misma regla, en `src/modulos/productos/lib/codigo.ts` para la vista previa: se quitan todos los espacios y se pasa a mayúsculas. «ab-12», « AB 12» y «AB12 » quedan «AB-12», «AB12» y «AB12». Caracteres admitidos: letras A a Z, cifras y `. _ / -`, hasta 40. La vista previa del importador muestra el código original y el normalizado, y reporta aparte dos códigos distintos del archivo que normalizan igual (4.3).
- Único entre todos los productos, también los archivados (decisión 9.3). Recuperar un código es restaurar el producto archivado.
- Editable: las líneas guardan una copia del código (2.6), así que renombrarlo no cambia lo ya emitido. El cambio queda en el historial.
- Numeración automática (decisión 9.1): si el alta llega sin código, `productos_preparar` lo pide a la serie `producto` con `series_siguiente('producto')`. La serie se siembra con `on conflict do nothing`, modo `con_huecos`, sin reinicio, prefijo `P-` y relleno 5 (`P-00001`), y el archivo comprueba después que el modo y el reinicio son esos y aborta si no (`docs/esquema.md`, «Numeración»). Quien tiene `gestionar_series` cambia prefijo y relleno después; como el prefijo admite cualquier texto de hasta 20 caracteres, el código que entrega la serie se normaliza y se valida como uno manual, y uno inválido falla con pista `productos_codigo_serie` («el prefijo de la serie producto no da un código válido»). Los huecos son normales: un alta deshecha no devuelve su número.

**Trigger `productos_preparar`** (BEFORE INSERT OR UPDATE, `security definer`, nombre anterior a `zy_` y `zz_`):

1. Código. Si llega con texto, lo normaliza. Si es alta y llega nulo o vacío, lo pide a la serie, lo normaliza y lo valida (pista `productos_codigo_serie`). Si el número de la serie ya existe como código, pide el siguiente hasta dar con uno libre; el bucle termina porque los códigos ocupados son finitos, y se corta con error tras `count(*) + 1` intentos. Los números saltados no se reponen (modo con huecos) y no hace falta mover la secuencia.
2. Impuesto. Solo en el alta: si llega nulo, pone la clase predeterminada activa; si no hay, falla con pista `productos_sin_impuesto`. En un cambio, `impuesto` nulo falla por el `not null` (23502): no se reclasifica en silencio.
3. Moneda. Solo en el alta o si cambian `precio_lista` o `precio_lista_moneda`: con importe y sin moneda pone `instalacion.moneda_base`; con importe nulo pone la moneda nula; con otra moneda falla (pista `productos_moneda`). Un producto cuyo precio quedó en otra moneda porque el administrador cambió `moneda_base` se sigue editando en todo lo demás (comprobación 26 de `verificar.sql` lo avisa).
4. Unidad base. En un cambio de `unidad_base`, falla si el producto tiene conversiones (pista `productos_unidad_con_conversiones`), si tiene precio de lista (pista `productos_unidad_con_precio`: el precio es por la unidad anterior; se quita, se cambia la unidad y se vuelve a poner) o si aparece en alguna tabla de `productos_lineas` (pista `productos_unidad_en_uso`; consulta dinámica con `format('… %s …', tabla)` sobre el `regclass` del registro, que solo escribe el dueño). Como es definer, ve las líneas sin la RLS de quien edita.
5. Referencias archivadas. En el alta, o si cambian, rechaza una unidad, una clase o una categoría archivadas (pistas `productos_unidad_archivada`, `productos_impuesto_archivado`, `productos_categoria_archivada`). Si no cambian, un producto viejo con una unidad que se archivó después se sigue editando.

`security definer` porque `series_siguiente` solo la ejecutan la service role y las funciones definer (PP-DEC-25) y porque el paso 4 lee tablas de otros módulos. No confía en nada del cliente: todo lo que lee es de la propia fila, de `instalacion`, de los catálogos, del registro de líneas y de la serie.

La concurrencia del paso 4 la cierra el bloqueo de fila: el `update` de `productos` ya bloquea la fila, y `productos_conversiones_validar` y `productos_linea_preparar` leen el producto con `for share`, que choca con ese bloqueo (el `for key share` de la llave foránea no basta, porque no choca con un `update` de una columna que no es llave). Quien llega segundo espera y, en `read committed`, vuelve a leer lo confirmado.

### 2.5 `productos_conversiones`

| Columna | Tipo | Restricción | Por qué |
|---|---|---|---|
| `producto_id` | `uuid not null` | FK a `productos(id) on delete cascade` | La conversión es parte del producto |
| `unidad` | `text not null` | FK a `productos_unidades(clave) on delete restrict` | |
| `factor` | `numeric(18,6) not null` | check `factor > 0`; check `factor >= 1 or mod(1::numeric, factor) = 0` | Cuántas unidades base hay en una unidad alterna: 1 `caja` = 12 `und` es factor 12; 1 `g` en un producto en `kg` es factor 0.001. Es la convención de ERPNext (`conversion_factor` de `UOM Conversion Detail`). Un factor menor que 1 solo se admite si es el inverso de un entero: 1/12 no cabe exacto en seis decimales y doce líneas de 1 und sumarían 0.999996 cajas. La pista `productos_factor_inexacto` dice que se use como base la unidad menor |
| contrato | | `contrato_aplicar('public.productos_conversiones', array['archivado_en'])` | Una conversión se quita, no se archiva: las líneas que la usaron guardan su propio factor |

- PK `(producto_id, unidad)`: una unidad alterna por producto una sola vez. Índice `productos_conversiones_unidad_idx` sobre `unidad` para la llave `restrict` hacia unidades.
- Trigger `productos_conversiones_validar` (BEFORE INSERT OR UPDATE, invoker): lee el producto con `select unidad_base … for share` y rechaza la unidad base del propio producto (pista `productos_conversion_base`; su factor es 1 por definición y no se guarda) y una unidad archivada en el alta.
- Corregir un factor está permitido y queda en el historial: no cambia ninguna línea ya creada.

### 2.6 Líneas que cuentan productos: contrato, registro y función

Toda tabla de Inventario, Compras, Ventas o Facturación que cuente un producto se crea en su archivo de esquema y luego llama `select public.productos_aplicar_linea('public.<tabla>', '<modulo>', <con_impuesto>);`. La función (4.5) añade lo que falte de esta tabla y registra la tabla en `productos_lineas`:

| Columna de la línea | Qué |
|---|---|
| `producto_id uuid not null` | FK a `productos(id) on delete restrict`, con índice `<tabla>_producto_idx`: un producto con líneas no se borra, se archiva |
| `producto_codigo text not null`, `producto_nombre text not null` | Copia al crear la línea: el documento impreso no cambia si se renombra el producto |
| `unidad text not null` | FK a `productos_unidades(clave) on delete restrict`; nula al insertar se toma como la unidad base |
| `factor numeric(18,6) not null check (factor > 0)` | Copia de `productos_factor` al crear la línea, que no cambia si luego se corrige en el catálogo (BL-52) |
| `cantidad numeric(18,6) not null` | En la unidad de la línea |
| `cantidad_base numeric(18,6) generated always as (round(cantidad * factor, 6)) stored` | La que suman inventario y avance |
| `impuesto text not null`, `porcentaje_impuesto numeric(7,4) not null` | Solo con `con_impuesto`: la clase (nula al insertar se toma la del producto) y la copia de su porcentaje. Editar la clase después no cambia la línea |

- Trigger `productos_linea_preparar` (BEFORE INSERT OR UPDATE, invoker, nombre anterior a `zy_` y `zz_`), que la función pone en la tabla: en el alta lee el producto con `for share`, rechaza un producto, una unidad o una clase archivados (pistas `productos_archivado`, `productos_unidad_archivada`, `productos_impuesto_archivado`) y escribe las copias, ignorando lo que mande el cliente. En un cambio, si cambian `producto_id`, `unidad` o `impuesto`, recalcula las copias; si no, las deja como estaban. Que una línea de un documento publicado no se edite lo pone la escritura por estado (BL-07) de cada documento, no este trigger.
- El precio de la línea lo propone el módulo que la crea como `precio_lista * factor` cuando `precio_lista_moneda` es la moneda base; si no, la línea se crea sin precio propuesto. Ese precio es del documento y va como par en su propia columna.
- El código DIAN de la unidad lo copia Facturación al publicar la factura (0.9), no esta función.
- `productos_lineas` (exenta del contrato): `tabla regclass` PK, `modulo text not null`, `con_impuesto boolean not null`, `created_at timestamptz not null default now()`. Solo la escribe `productos_aplicar_linea`, que ejecuta el dueño. RLS activa, `modulo_productos` y `exigir_mfa`, sin políticas permisivas ni grants para la API. La lee `productos_preparar` (paso 4) y la comprobación 24.
- La convención se añade a `docs/esquema.md` en el mismo paso que `22-catalogo.sql`, como sección «Unidad y factor en las líneas».

### 2.7 Impuestos: el mínimo para IVA y retenciones

Lo que deja este módulo y lo que hará Facturación con ello:

- **IVA.** Cada producto tiene una clase (`productos.impuesto`) con tipo, tratamiento y porcentaje. Una línea con impuesto copia la clase y el porcentaje al crearse (2.6). Que el emisor no sea responsable de IVA, o que un tercero esté exento, lo resuelve la regla por tercero de BL-61, no el producto: la clase describe el bien, no la operación.
- **INC y combinaciones.** El INC va por la misma columna con `tipo = 'inc'`. Si un bien lleva dos impuestos a la vez (por ejemplo IVA e INC; los casos los confirma el asesor contable), la 0.9 convierte la clase en plantilla con componentes (`productos_impuestos_componentes`) sin cambiar la columna del producto ni las líneas, que guardan la clave. Si además hace falta una clase distinta para compras, es una columna nula `impuesto_compra` (nula: la misma de venta). Lo decide el usuario en la 9.5.
- **Retenciones.** Dependen del concepto (compra de bienes, servicios, honorarios), de la base mínima en UVT y del tercero. El producto aporta `tipo` (bien o servicio), que decide el concepto en la mayoría de los casos. Cuando un producto necesite un concepto distinto, la 0.9 añade `concepto_retencion` nulo en `productos` con una llave a su catálogo de conceptos (BL-62).
- **Qué no se hace aquí:** ni cálculo, ni vigencias, ni cuentas contables, ni reglas por tercero.

### 2.8 `productos_cambios` (exenta del contrato)

Historial único del producto, sus conversiones y los tres catálogos, como `crm_cambios`. Sin llave foránea, como `crm_cambios.entidad_id`: el historial de un producto borrado sobrevive.

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | `bigint generated always as identity` | PK |
| `entidad` | `text not null` | check `entidad in ('producto', 'conversion', 'unidad', 'impuesto', 'categoria')` |
| `entidad_id` | `text not null` | el `id` del producto (también para sus conversiones), la `clave` de la unidad o de la clase, el `id` de la categoría |
| `operacion` | `text not null` | check `operacion in ('insert', 'update', 'delete')` |
| `campos` | `text[] not null default '{}'` | |
| `antes`, `despues` | `jsonb` | cada lado recortado a 2 KB como en el CRM; en una conversión incluyen siempre `unidad` |
| `autor_id` | `uuid` | `auth.uid()`; nulo sin sesión |
| `created_at` | `timestamptz not null default now()` | |

- Índice `productos_cambios_entidad_idx` sobre `(entidad_id, created_at desc)`. La ficha del producto lee `entidad_id = :id and entidad in ('producto', 'conversion')`.
- La escribe solo el trigger `productos_registrar_cambio` (AFTER INSERT OR UPDATE OR DELETE en las cinco tablas; `security definer` porque la API no tiene `insert` sobre la tabla). En un update guarda solo los campos que cambian, sin `updated_at`, `updated_by` ni `creado_via` (como `21d-crm-contrato.sql`). El precio va en el mismo historial: el origen lo llevaba en una tabla aparte y aquí no hace falta.
- Retención: el borrado físico de un producto (solo un administrador y solo sin líneas, 3.2) deja una fila `delete` con la fila completa en `antes`, y la cascada a sus conversiones deja una fila `delete` por cada una. No se purga: el catálogo no tiene datos de personas, así que no aplica la supresión de la Ley 1581 que obliga al CRM a borrar el suyo.
- El borrado de un producto deja además una fila en `audit_log` con `auditar_cambio` AFTER DELETE en `productos`, como `crm_cuentas`: `entity_id` es el `id`, que `auditar_cambio` reconoce. Los catálogos no llevan `auditar_cambio`: su clave no es `id` ni `name`, y `auditar_cambio` dejaría `entity_id` vacío y sin valores; su historial con antes y después está aquí.
- Exenta en `EXENTAS` de `contrato-tabla.test.ts`, con motivo: «historial inmutable: solo lo escribe productos_registrar_cambio, con autor_id y created_at propios».

## 3. Permisos y RLS

### 3.1 Registro

Los dos reemplazan al único que declara hoy el registro (`manage_products`, del origen). Ninguna instalación tiene el módulo, así que no hay roles que migrar ni semilla como la de `21c`.

| Clave | Etiqueta | Qué da |
|---|---|---|
| `app_productos` | Ver Productos | Ver el módulo, leer el catálogo, sus categorías, unidades, clases de impuesto e historial, y descargar el CSV de la lista |
| `edit_productos` | Editar productos, categorías y unidades | Crear, editar, archivar y restaurar productos, categorías y unidades; quitar y poner conversiones; importar |

- Las clases de impuesto las escribe solo un administrador (`is_admin()`), como `crm_campos_def`: una tarifa mal puesta pasa a las líneas que se creen. No hay permiso propio; si un cliente quiere delegarlo, se añade `gestionar_impuestos` y se suma a `permisos_solo_admin()`.
- Importar no es un permiso aparte: escribe lo mismo que el formulario, por la misma RLS. Se reabre si un cliente quiere que alguien edite a mano y no en bloque.
- Exportar no es un permiso aparte (decisión técnica 10): BL-12a lo pidió para el CRM porque protege datos de personas y lo acompañó de un tope en las lecturas directas; aquí no hay datos de personas y quien lee el catálogo, también desde un módulo dependiente, lo recorre entero por `/rest/v1/productos` o por `productos_buscar`. Un permiso que solo oculte el botón no cerraría nada.
- Borrar un producto, una categoría o una unidad: solo un administrador, y solo si nada lo referencia (las llaves con `restrict` lo impiden). Lo normal es archivar.
- Los dos permisos van también en `src/types.ts` (catálogo del shell, con descripción) y no son solo-admin.

Entrada del registro que reemplaza a la actual en `src/lib/modulos.ts`:

```ts
{
  slug: 'productos',
  nombre: 'Productos',
  icono: 'productos',
  ruta: '/productos',
  estado: 'disponible',
  permisos: [
    { clave: 'app_productos', etiqueta: 'Ver Productos' },
    { clave: 'edit_productos', etiqueta: 'Editar productos, categorías y unidades' },
  ],
  widgets: [],
  acciones: [],
  tablas: [
    'productos', 'productos_categorias', 'productos_unidades', 'productos_conversiones',
    'productos_impuestos', 'productos_cambios', 'productos_lineas',
  ],
  sql: '22-catalogo.sql',
  depende: [],
  integra: [],
  conectores: [],
  limites: {},
}
```

Sale el conector `cambio` (tasa de cambio): con una moneda por instalación no hay nada que consultar (D-15 opción a). El tipo `Conector` conserva `'cambio'` hasta que se decida multimoneda; nadie lo declara.

### 3.2 Políticas, tabla por tabla

Todas son `to authenticated` y envuelven cada función en `(select …)` como el CRM. Además de las permisivas de abajo, cada tabla lleva `modulo_productos` (restrictiva: sin el módulo activo nada pasa) y `exigir_mfa` (restrictiva). Nada para `anon`.

**Función de lectura `productos_puede_leer()`** (`language sql stable`, `security invoker`): verdadera si `puede_ver_app('productos')` o `puede_ver_app(s)` para algún `s` de los módulos que dependen **directamente** del catálogo, los que tienen `'productos'` en `depende`: hoy `cotizador`, `inventario`, `compras`, `ventas` y `facturacion`. No es `dependientesDe('productos')`, que es transitiva e incluye `cartera` por `facturacion`: Cartera lee facturas, cuyas líneas ya llevan copia del código y el nombre. Quien registra un pedido en Ventas tiene que poder elegir un producto sin que se le dé el módulo Productos entero. `puede_ver_app` ya es definer y da falso si el módulo no tiene su fila activa en `modulos_instalacion` (un planeado no la tiene: el instalador no lo activa); por eso esta función no necesita serlo. Grant de `execute` a `authenticated`. La prueba de `esquema.test.ts` compara la lista con `MODULOS.filter((m) => m.depende.includes('productos'))`, leyendo la última definición de la función entre `22-catalogo.sql` y sus `22b…` posteriores.

| Tabla | select | insert | update | delete |
|---|---|---|---|---|
| `productos` | `productos_puede_leer()` | `has_perm('edit_productos')` en `with check` | `has_perm('edit_productos')` en `using` y `with check` | `is_admin()` |
| `productos_categorias` | `productos_puede_leer()` | `has_perm('edit_productos')` | `has_perm('edit_productos')` en `using` y `with check` | `is_admin()` |
| `productos_unidades` | `productos_puede_leer()` | `has_perm('edit_productos')`, con grants por columna (2.1) | `has_perm('edit_productos')` en `using` y `with check`, con grants por columna | `is_admin()`; las `sistema` las frena el trigger |
| `productos_conversiones` | `productos_puede_leer()` | `has_perm('edit_productos')` | `has_perm('edit_productos')` en `using` y `with check` | `has_perm('edit_productos')` |
| `productos_impuestos` | `productos_puede_leer()` | `is_admin()` | `is_admin()` en `using` y `with check` | `is_admin()` |
| `productos_cambios` | `puede_ver_app('productos')` | sin política ni grant | sin política ni grant | sin política ni grant |
| `productos_lineas` | sin política ni grant | sin política ni grant | sin política ni grant | sin política ni grant |

En prosa, lo que no se ve en la tabla:

- Archivar y restaurar es un `update` de `archivado_en`: lo hace quien tiene `edit_productos`. No hay excepción para el administrador más allá de que `has_perm` le da todo permiso (D-9).
- El historial lo lee quien ve Productos, no quien solo ve un módulo dependiente: un vendedor ve el producto y su precio, no quién lo cambió.
- El precio de lista lo ve todo el que lee el catálogo. El costo, cuando exista, irá con permiso por campo (BL-43).
- Grants: `revoke all … from anon, authenticated` en las siete; `select, insert, update, delete` a `authenticated` sobre `productos`, `productos_categorias`, `productos_conversiones` y `productos_impuestos`; sobre `productos_unidades`, `select` y `delete` más los `insert` y `update` por columna de 2.1; `select` sobre `productos_cambios`; nada sobre `productos_lineas`. `service_role`: `all` sobre las cinco de negocio y configuración y `select` sobre `productos_cambios` y `productos_lineas`.
- El bloque de verificación del archivo aborta si alguna de las siete tablas queda sin RLS, sin `modulo_productos` o sin `exigir_mfa`, si `authenticated` tiene escritura sobre `productos_cambios` o `productos_lineas`, o sobre `productos_unidades.sistema` o `codigo_dian`, o si alguna función de trigger es ejecutable por la API.

## 4. Funciones de base

### 4.1 Cuáles son `security definer` y por qué

| Función | Tipo | Por qué |
|---|---|---|
| `productos_preparar()` | trigger, **definer** | Llama a `series_siguiente`, que la API no ejecuta (PP-DEC-25), y lee las tablas de líneas de otros módulos (2.4, paso 4) |
| `productos_registrar_cambio()` | trigger, **definer** | Escribe `productos_cambios`, sobre la que la API no tiene `insert` |
| `productos_clave_inmutable()`, `productos_categorias_validar()`, `productos_conversiones_validar()`, `productos_impuestos_predeterminado()`, `productos_linea_preparar()` | trigger, invoker | Leen tablas que quien escribe ya puede leer (una línea la escribe alguien de un módulo dependiente, que lee el catálogo) |
| `productos_puede_leer()` | invoker | Solo compone `puede_ver_app`, que ya es definer |
| `productos_buscar`, `productos_importar`, `productos_factor`, `productos_impuesto_predeterminar` | invoker | La RLS de quien llama decide qué filas ve y qué escribe; una definer aquí saltaría la política `modulo_productos` |
| `productos_aplicar_linea` | invoker, solo el dueño | La llaman los archivos de esquema, como `contrato_aplicar` |

Las de trigger llevan `revoke execute … from public, anon, authenticated`; `productos_aplicar_linea`, además, `from service_role`: solo la ejecuta el dueño.

### 4.2 `productos_buscar`

```text
productos_buscar(p_q text default null, p_categoria uuid default null,
                 p_subcategorias boolean default true, p_tipo text default null,
                 p_uso text default null, p_archivados boolean default false,
                 p_limite int default 50, p_desde int default 0)
returns table (fila public.productos, total bigint)
language sql stable security invoker
```

- Devuelve la fila entera como tipo compuesto (`fila public.productos`), no una lista de columnas: añadir una columna a `productos` en un `22b` no obliga a borrar y recrear la función con otro tipo de retorno. PostgREST la entrega como objeto `{fila: {...}, total}`; el paso 5 lo comprueba con supabase-js antes de escribir las pantallas.
- Como `crm_buscar`: escapa `\ % _` antes de armar el patrón, busca con `ilike` en `codigo` y `nombre` (los índices trigrama) y además compara el código normalizado del término; devuelve `count(*) over ()` como `total`; tope de 200 por página.
- `p_uso`: `'venta'` filtra `vendible`, `'compra'` filtra `comprable`, nulo no filtra (check en la función, pista `productos_uso`, 22023). Los selectores de Ventas y Compras lo pasan; la lista de Productos no.
- Orden: primero el código exacto (un lector de códigos o quien teclea el código ve su producto arriba), luego `nombre, id`.
- `p_categoria` con `p_subcategorias` incluye la categoría y sus descendientes (CTE recursiva con `union` y tope de nivel, 2.3).
- Por defecto sin archivados.
- La usan la lista, Ctrl+K, la exportación (5.6) y los selectores de producto de los documentos.

### 4.3 `productos_importar`

```text
productos_importar(p_filas jsonb, p_simular boolean default true) returns jsonb
language plpgsql security invoker
```

- Exige `has_perm('edit_productos')` (pista `productos_importar`, 42501) y como máximo 500 filas por llamada (pista `productos_importar_lote`, 22023). El navegador parte el archivo en lotes de un tamaño constante (`TAMANO_LOTE` en `lib/importador.ts`, 100 por defecto) que fija la medición de la sección 10.
- Cada fila es un objeto ya mapeado por el navegador: `fila` (número en el archivo), `codigo`, `nombre`, `descripcion`, `tipo`, `vendible`, `comprable`, `categoria_id`, `unidad_base`, `impuesto`, `precio_lista` (texto decimal con punto, ya leído con el separador que eligió el usuario), `archivado` (booleano) y `conversiones` (lista `{unidad, factor}`). Una clave ausente no cambia el valor guardado; es la regla del importador del origen («una celda vacía no borra datos»). Vaciar un valor se hace en el formulario.
- Repetidos dentro del lote: antes de escribir, la función marca como error todas las filas que comparten código normalizado y, entre las que no traen código, las que comparten nombre normalizado («repetido en las filas N y M»), y no las escribe. El navegador hace lo mismo sobre el archivo entero antes de partirlo (5.5), así que entre lotes no hay repetidos y ningún lote depende de lo que escribiría otro.
- Empareja por código normalizado (contra todos los productos, archivados incluidos). Sin código, crea con código automático; si hay un producto activo con el mismo nombre normalizado, la fila es un error («ya existe; pon su código»), para que reimportar un archivo sin códigos no duplique el catálogo.
- `conversiones` presente es el conjunto deseado del producto: la función compara con el guardado y solo borra las que faltan, inserta las nuevas y actualiza los factores distintos. Si nada difiere, la fila cuenta como sin cambio y no deja historial. Ausente, no lo toca.
- Escribe con `creado_via = 'importacion'`. Cada fila corre en su propio bloque `begin … exception`: un error de una fila (check, llave, pista de un trigger) se anota en esa fila con su pista y no tumba las demás.
- Con `p_simular`, todo el lote corre dentro de un bloque que termina en una excepción propia atrapada al final: la base deshace las escrituras y la función devuelve el resultado guardado en una variable (simulacro con ROLLBACK, BL-44). En el simulacro, las filas sin código se insertan con un marcador propio (`'SIM-' || <32 cifras hexadecimales de gen_random_uuid()>`), así el trigger no pide número a la serie y el simulacro no gasta números; el resultado devuelve el código como nulo («automático»).
- El simulacro predice la escritura real salvo lo que cambie entre medias: otro usuario que cree o edite un producto, un administrador que archive una unidad. La vista previa no lo garantiza y el reporte final es el que vale.
- Devuelve `{crear, actualizar, sin_cambio, error, filas: [{fila, accion, id, codigo, errores}]}`.
- Sin simular, deja `productos.importar` en `audit_log` con los conteos del lote y `origen = 'cliente'` (la política de `audit_log` admite las filas de la propia sesión, como `crm_exportar`).
- Por qué en la base y no como el CRM: ver la decisión técnica 4. Lo que sí se reutiliza del importador del CRM está en la sección 5.5.

### 4.4 `productos_factor`

```text
productos_factor(p_producto uuid, p_unidad text) returns numeric
language plpgsql stable security invoker set search_path = public, pg_temp
```

1 si `p_unidad` es la unidad base del producto; el `factor` de `productos_conversiones` si hay conversión; si no, `raise exception … using errcode = '22023', hint = 'productos_unidad_sin_conversion'` (por eso es `plpgsql`: una función `sql` no puede levantar un error con pista). Es la única fuente del factor para las líneas: la llama `productos_linea_preparar` (2.6). Grant a `authenticated`.

### 4.5 `productos_aplicar_linea`

```text
productos_aplicar_linea(p_tabla regclass, p_modulo text, p_impuesto boolean default false) returns void
language plpgsql security invoker set search_path = public, pg_temp
```

- Como `contrato_aplicar`: comprueba que `p_tabla` es una tabla simple de `public` y que `p_modulo` es un slug válido; añade las columnas de 2.6 que falten y comprueba el tipo de las que ya estaban; crea las llaves `on delete restrict`, el check del factor, la columna generada, el índice `<tabla>_producto_idx` y el trigger `productos_linea_preparar`; inserta o actualiza la fila de `productos_lineas`.
- Solo la ejecuta el dueño de la base (el instalador): `revoke execute … from public, anon, authenticated, service_role`.
- Una tabla que tenga una llave hacia `productos(id)` sin haber pasado por esta función la detectan la comprobación 24 de `verificar.sql` y la prueba de `esquema.test.ts` (sección 7).

### 4.6 `productos_impuesto_predeterminar`

```text
productos_impuesto_predeterminar(p_clave text) returns void
language plpgsql security invoker set search_path = public, pg_temp
```

Desmarca la predeterminada actual y marca `p_clave` en la misma transacción, en ese orden, para que el índice único parcial no choque; el trigger diferido comprueba al confirmar que queda exactamente una. Falla si la clase no existe o está archivada (pista `productos_impuesto_archivado`). La RLS de `productos_impuestos` la limita a un administrador. Grant a `authenticated`.

## 5. Pantallas

Rutas bajo `/productos/*` (`src/modulos/productos/rutas.tsx` y `RutasProductos.tsx`), con el patrón del CRM: `CabeceraPagina`, `BarraFiltros`, `Dialogo`, filtros en la URL, `Cargar más` de 50 en 50. A 1280 px tablas; a 375 px tarjetas, filtros plegados en `BarraFiltros` y diálogos a pantalla completa. Sin párrafos de ayuda ni leyendas, sin emojis, acciones como botones. Ninguna pantalla trae datos de personas, así que no aplica `campoPersona`; sí `autoComplete="off"` en todos los campos.

### 5.1 Lista (`/productos`)

- Cabecera «Productos» con los botones Nuevo producto e Importar (con `edit_productos`), Exportar y Catálogos (con `app_productos`).
- Filtros: búsqueda (código o nombre), Categoría (selector del árbol con sangría; incluye subcategorías), Tipo (Bien, Servicio) y Archivados.
- 1280 px: tabla con Código, Nombre, Categoría, Unidad, Impuesto, Precio de lista (alineado a la derecha, `fmtImporte`) y una marca «Archivado» cuando lo está. La fila abre la ficha.
- 375 px: tarjeta con código y nombre en la primera línea, categoría y precio en la segunda.
- Estados: cargando (esqueleto), vacío sin filtros (con Nuevo producto si hay permiso), vacío con filtros (Quitar filtros), error (Reintentar).
- Ctrl+K: proveedor de búsqueda «Productos» en `rutas.tsx` con `productos_buscar` (cinco resultados: título el nombre, meta el código).

### 5.2 Ficha (`/productos/:id`)

- Cabecera con código y nombre; botones Editar (con `edit_productos`), Archivar o Restaurar (con `edit_productos`) y Borrar (solo administrador; si la base lo niega por referencias, el mensaje traducido dice que se archive).
- Pestañas: Datos (tipo, se vende, se compra, categoría con su ruta, unidad base, impuesto con nombre y porcentaje, precio de lista por unidad base, descripción, creado y actualizado), Unidades e Historial.
- Unidades: tabla «Unidad · Equivale a» con «1 caja = 12 und»; Añadir unidad alterna, Cambiar factor y Quitar (con `edit_productos`). El selector de unidad no ofrece la unidad base ni las archivadas.
- Historial: lista legible de `productos_cambios` del producto y sus conversiones («Precio de lista: COP $ 10.000 → COP $ 12.000», «Unidad alterna caja: factor 10 → 12»), con autor y fecha.

### 5.3 Formulario (diálogo)

- Campos: Código, Nombre, Tipo (Bien o Servicio), Se vende, Se compra, Categoría, Unidad base, Impuesto (con la predeterminada elegida), Precio de lista (con la moneda base como prefijo fijo y la etiqueta «Precio de lista por <unidad base>») y Descripción.
- Código vacío en el alta: lo pone la serie. El `placeholder` es un ejemplo inventado («A-100»).
- La vista previa del código normalizado se muestra al salir del campo (misma regla que la base, `codigo.ts`).
- Precio: `validarImporte` de `src/lib/moneda.ts` y lectura con coma decimal (`leerDecimal` con separador coma, 5.5).
- Edición concurrente (BL-09): el guardado manda `updated_at` leído (`.eq('updated_at', leido)`); con cero filas, «Otra persona cambió este producto. Recarga para ver sus cambios.»
- Unidad base: el campo es editable siempre. Si la base niega el cambio (conversiones, precio o líneas), el formulario muestra el error traducido junto al campo, como el resto de los errores de la pantalla.
- Errores de la base traducidos por su pista, como `traducirError` del CRM.

### 5.4 Catálogos (`/productos/catalogos`)

- Pestañas Categorías y Unidades; editar exige `edit_productos`, ver exige `app_productos`.
- Categorías: árbol con sangría y orden; Nueva categoría, Nueva subcategoría, Renombrar, Mover (cambia el padre) y Archivar. Lo que niega la base (ciclo, profundidad, hijas activas) sale con su mensaje.
- Unidades: tabla Clave, Nombre, Símbolo, Decimales; Nueva unidad, Editar (la clave no se edita después de crearla), Archivar. `und` no se archiva.
- Clases de impuesto: pestaña de Administración «Productos» (`pestanasAdmin`, acceso `admin`), como `AjustesCrm`. Tabla Clave, Nombre, Tipo, Tratamiento, Porcentaje, Predeterminada; Nueva clase, Editar (nombre y porcentaje), Marcar como predeterminada (`productos_impuesto_predeterminar`) y Archivar. Quien no es administrador ve las clases en solo lectura dentro de la ficha.

### 5.5 Importador CSV (diálogo)

Mismas fases que el del CRM: archivo, vista previa, escribiendo y fin con reporte.

1. Archivo: CSV con `leerCsv` (separador de campos detectado, BOM) y una opción Separador decimal (Coma, Punto), con Coma elegida. Botón Descargar plantilla (encabezados y una fila `EJEMPLO-`, que se omite al importar).
2. Mapeo en el navegador: encabezados por alias (Código, Nombre, Tipo, Se vende, Se compra, Categoría, Unidad base, Unidades alternas, Impuesto, Precio de lista, Moneda, Descripción, Archivado), categoría por ruta («Herramientas / Manuales») contra el árbol cargado, unidad e impuesto por clave o nombre contra los catálogos cargados, precio y factores con `leerDecimal` y el separador elegido, unidades alternas con el formato `caja=12 | paquete=6`. Los errores de forma salen aquí por fila. Luego, sobre el archivo entero y antes de partirlo: códigos repetidos tras normalizar, dos códigos distintos que normalizan igual («AB 12» y «AB12», reportados aparte) y filas sin código con el mismo nombre; todas las filas implicadas quedan con error y no se envían.
3. Vista previa: el navegador llama `productos_importar` con `p_simular = true` lote a lote y muestra Crear, Actualizar, Sin cambio y Con error, con la lista de errores, el código original y el normalizado, y cada unidad alterna escrita como relación («1 g = 0,001 kg»), para que un factor mal leído se vea antes de escribir. Las categorías del archivo que no existen salen en una lista con el botón Crear estas categorías; sin crearlas, esas filas son errores.
4. Escribiendo: los mismos lotes con `p_simular = false`, con avance y Cancelar entre lotes.
5. Fin: conteos y Descargar reporte (las filas con su resultado). Cada lote es una transacción: si uno falla a mitad, los anteriores quedaron escritos y el reporte lo dice; reimportar el mismo archivo da «sin cambio» en lo ya escrito.

Tope: 20 000 filas por archivo (el doble del CRM). Lote: `TAMANO_LOTE`.

**Qué se reutiliza del importador del CRM y cómo:**

- `src/modulos/crm/lib/csv.ts` (`leerCsv`, `detectarSeparador`, `escribirCsv`, `neutralizar`) pasa a `src/lib/csv.ts` con su prueba; el CRM importa desde ahí. Es un movimiento sin cambio de comportamiento y va en un paso propio antes del módulo.
- De `src/modulos/crm/lib/importador.ts` salen a `src/lib/importacion.ts` las piezas que no son de cuentas: `normalizar`, la reversión de la neutralización de fórmulas, `lotes`, `PREFIJO_EJEMPLO` y el mapeo de encabezados por alias (que pasa a recibir el mapa de alias). El tipo `FilaImportada` se vuelve genérico sobre los datos de la fila. `contarImportacion` y `filasReporte` de `crm/lib/vistas.ts` van al mismo archivo. El CRM conserva su lógica de cuentas.
- `ImportarVista` de `crm/paginas/Importar.tsx` pasa a `src/components/ImportadorCsv.tsx`, con los conteos, los errores y un hueco para contenido propio (la lista de categorías nuevas y el separador decimal) por props. El CRM la usa con su contenido de hoy.
- Lo que no se reutiliza: el plan por fila calculado en el navegador contra `cuentasParaImportar`. En Productos lo calcula la base.
- Nuevo y compartido: `src/lib/numeros.ts` con `leerDecimal(texto, separador)`, adaptado del `numero()` del origen pero sin adivinar: con separador coma, el punto es de miles y solo se admite en grupos de tres cifras; con separador punto, la coma es de miles con la misma regla; cualquier otra forma es un error de la fila. Lleva su prueba con «1.250» (1250 con coma, 1,25 con punto), «0,001», «1.234,5» y «1,234.5».

### 5.6 Exportar (diálogo)

Resumen de los filtros activos y Descargar CSV, con `app_productos`. El navegador pagina `productos_buscar` con los filtros de la lista, de 200 en 200, y por cada página lee las conversiones de esos productos (`productos_conversiones` con `in('producto_id', ids)`); la ruta de la categoría sale del árbol ya cargado. Si el `total` cambia entre páginas, se detiene con «La lista cambió mientras se exportaba. Vuelve a intentarlo.» Tope de 20 000 productos, el mismo del importador, para que el archivo sea reimportable entero; con más, pide filtrar. El CSV usa `escribirCsv` (`;`, BOM, fórmulas neutralizadas) con las columnas de la plantilla, en el mismo orden, y los números con coma decimal: Código, Nombre, Tipo, Se vende, Se compra, Categoría (ruta), Unidad base, Unidades alternas, Impuesto, Precio de lista, Moneda, Descripción, Archivado.

## 6. Pruebas de permisos y verificación

### 6.1 Sección nueva de `supabase/pruebas/rls-simulacion.sql`

Sección **19) Productos**, con el patrón de la 12: activa el módulo dentro de la transacción, crea roles de prueba `prueba-rls-prod-ver` (`app_productos`) y `prueba-rls-prod-edit` (`app_productos`, `edit_productos`), y sale `OMITIDO 19 productos · falta 22-catalogo.sql` si no está aplicado o si faltan las cuentas miembro o admin. La cabecera del archivo suma la sección a su lista y a «Requiere». Para las líneas, como postgres crea una tabla temporal `prueba_lineas` y le aplica `productos_aplicar_linea(…, 'inventario', true)`; si una tabla temporal no pudiera llevar la llave, la crea en `public` dentro de la transacción, que se deshace.

| Caso | Qué | Resultado esperado |
|---|---|---|
| 19.1 | Miembro con `app_productos` lee y crea un producto | `lee / 42501` |
| 19.2 | Miembro con `edit_productos` crea un producto con código « ab-12 » y autoría falsa | `entró`; código `AB-12`, `created_by` el miembro, `creado_via` `manual` |
| 19.3 | Otro alta con código «ab-12» | `23505` |
| 19.4 | Alta sin código; alta sin código cuando el siguiente número de la serie ya existe como código manual | `entró` con forma `^P-[0-9]{5}$` / `entró` con el siguiente número libre |
| 19.5 | Alta sin impuesto y con precio sin moneda; luego un cambio con `impuesto` nulo | `entró` con la predeterminada y la `moneda_base` / `23502` |
| 19.6 | Precio negativo; moneda distinta de `moneda_base`; moneda sin precio; renombrar un producto con precio en otra moneda (insertado como postgres) | `23514 / 23514 / 23514 / entró` |
| 19.7 | Conversión con factor 0; a la unidad base; con factor 0.083333; con factor 0.001 | `23514 / 23514 / 23514 (productos_factor_inexacto) / entró` |
| 19.8 | Cambiar la unidad base: con conversiones; con precio; con una línea en `prueba_lineas`; sin nada de eso | `23514 ×3 (con_conversiones, con_precio, en_uso) / entró` |
| 19.9 | `productos_factor` con la unidad base, con `caja` (factor 12) y con una unidad sin conversión; línea de 2 `caja` con `factor` 99 y `producto_nombre` falso enviados; cambiar luego el factor del catálogo | `1 / 12 / 22023`; la línea guarda factor 12, `cantidad_base` 24 y el nombre real; el cambio de catálogo no la toca |
| 19.10 | Miembro con `edit_productos` borra un producto; admin borra el mismo | `0 filas / 1 fila`, con 1 fila `delete` en `productos_cambios` y 1 fila `productos.delete` en `audit_log` con `entity_id` igual al `id` |
| 19.11 | Admin cambia la clave de una unidad; borra una unidad en uso; borra `und`; miembro con `edit_productos` pone `sistema = false` en `und`, inserta una unidad con `sistema = true` y cambia un `codigo_dian` | `23514 / 23503 / 23514 / 42501 / 42501 / 42501` |
| 19.12 | Miembro con `edit_productos` inserta una clase; admin marca una segunda predeterminada a mano; admin desmarca la única y fuerza la comprobación (`set constraints … immediate`); admin usa `productos_impuesto_predeterminar('iva_reducido')`; admin cambia el tratamiento de una clase | `42501 / 23505 / 23514 / una sola predeterminada / 23514` |
| 19.13 | Categoría en ciclo (A hija de B, B hija de A); archivar una categoría con hija activa; mover una categoría con dos niveles de hijas bajo una de nivel 2 | `23514 / 23514 / 23514 (productos_categoria_profundidad)` |
| 19.14 | Cambio de precio; cambio de nombre de una unidad; miembro inserta en `productos_cambios` | fila con `campos = {precio_lista}`, sin `updated_by` ni `creado_via` / fila `unidad` con `entidad_id` la clave / `42501` |
| 19.15 | Miembro con solo `app_inventario` y el módulo `inventario` activo en la transacción lee `productos` y `productos_cambios` | `lee / 0 filas` (lee el catálogo, no el historial) |
| 19.16 | Módulo inactivo: el miembro con `edit_productos` lee e inserta | `0 filas / 42501` |
| 19.17 | `productos_importar` simulado con tres filas (una nueva sin código, una existente con nombre cambiado, una con unidad inexistente) | `1 / 1 / 1` en el resultado, ninguna fila escrita y la secuencia `serie_producto` sin avanzar |
| 19.18 | La misma importación sin simular; luego reimportar las filas válidas idénticas, con sus conversiones | `1 creada con creado_via importacion / 1 actualizada / 1 error` y 1 fila `productos.importar` / `sin_cambio 2` y ninguna fila nueva en `productos_cambios` |
| 19.19 | Un lote con el mismo código dos veces, con «AB 12» y «AB12», y con dos filas sin código y el mismo nombre | las seis filas con error de repetido y nada escrito |
| 19.20 | Importar sin `edit_productos`; importar 501 filas | `42501 / 22023` |
| 19.21 | Lote de 500 filas nuevas simulado como el rol `authenticated`, con el `statement_timeout` de ese rol | `OK` si termina en menos de 6 s; el detalle lleva la duración |
| 19.22 | `anon` lee `productos` y ejecuta `productos_buscar`, `productos_importar`, `productos_factor` y `productos_impuesto_predeterminar` | `42501` en todas o sin privilegio (`has_function_privilege` falso) |

El caso 19.15 inserta la fila de `inventario` en `modulos_instalacion` como postgres, como la sección 12 hace con `crm`; `inventario` sigue planeado en el registro, pero `has_modulo` solo mira la fila. Si esa fila llegara a estar prohibida por un trigger, el caso sale `OMITIDO` con el motivo. Las carreras de 2.3 y 2.4 no se pueden provocar en una sola sesión: las cubre la comprobación 25 de `verificar.sql`, que exige los bloqueos en el código de los triggers.

### 6.2 Comprobaciones nuevas de `supabase/esquema/verificar.sql`

Siguen la numeración (19 en adelante) y salen `OMITIDO` si `to_regclass('public.productos')` es nulo («Productos no está instalado (22-catalogo.sql)»). Las genéricas 1, 2, 7, 15 y 16 ya cubren RLS, MFA, política de módulo, contrato y moneda de las tablas nuevas sin cambios.

| N.º | Comprobación | DIFIERE (o AVISO) si |
|---|---|---|
| 19 | Funciones de Productos con el tipo esperado | `productos_buscar`, `productos_importar`, `productos_factor`, `productos_puede_leer` o `productos_impuesto_predeterminar` faltan o son `security definer`; `productos_factor` no es `plpgsql`; `productos_importar` no nombra `has_perm('edit_productos')`; alguna sin `search_path`; `anon` puede ejecutar alguna; `authenticated` o `service_role` pueden ejecutar `productos_aplicar_linea` |
| 20 | Historial cerrado a la API | `authenticated` o `anon` tienen `insert`, `update` o `delete` sobre `productos_cambios` o cualquier privilegio sobre `productos_lineas`; falta o está desactivado `productos_registrar_cambio` en alguna de las cinco tablas; falta `auditar_cambio` en `productos`; `productos_preparar` o `productos_registrar_cambio` no son definer o los ejecuta `authenticated` |
| 21 | Catálogos con clave inmutable | falta o está desactivado `productos_clave_inmutable` en `productos_unidades` o en `productos_impuestos`; falta `productos_impuestos_predeterminado` o no es diferido; no hay exactamente una clase predeterminada activa; falta `und` con `sistema`; `authenticated` puede insertar o actualizar `productos_unidades.sistema` o `codigo_dian` |
| 22 | Llaves del catálogo en `restrict` | alguna llave de `productos` hacia unidades, impuestos o categorías, de `productos_conversiones` hacia unidades, o de una tabla de `productos_lineas` hacia productos, unidades o impuestos, no es `on delete restrict` (`confdeltype <> 'r'`) |
| 23 | Serie de códigos | la serie `producto` no existe o no es `con_huecos` sin reinicio |
| 24 | Líneas registradas | una tabla con una llave hacia `productos(id)`, salvo `productos_conversiones`, no está en `productos_lineas`, o no tiene `productos_linea_preparar` activo, o no tiene índice sobre `producto_id` |
| 25 | Guardas de concurrencia | el código de `productos_categorias_validar` no contiene `pg_advisory_xact_lock`, o el de `productos_conversiones_validar` o `productos_linea_preparar` no lee el producto `for share` |
| 26 | Precios en otra moneda (AVISO) | hay productos con `precio_lista_moneda` distinta de `instalacion.moneda_base`; el detalle da cuántos |

Las comprobaciones 19 a 25 van también en el bloque de verificación final de `22-catalogo.sql`, que aborta el archivo.

## 7. Plan de archivos

En este orden, un paso por bloque probado (`0.7.N — Área: qué cambia`):

| Paso | Archivos | Qué |
|---|---|---|
| 1 | `src/lib/csv.ts`, `src/lib/importacion.ts`, `src/lib/numeros.ts`, `src/components/ImportadorCsv.tsx`, sus pruebas en `src/lib/__tests__/`; `src/modulos/crm/lib/importador.ts`, `crm/lib/vistas.ts`, `crm/paginas/Importar.tsx` y sus pruebas | Piezas comunes del importador fuera del CRM, sin cambio de comportamiento (las pruebas del CRM pasan antes y después) |
| 2 | `tools/instalar/ensayar.mjs` (opción `--simular`) y su prueba; `supabase/esquema/22-catalogo.sql`; `supabase/esquema/verificar.sql`; `supabase/pruebas/rls-simulacion.sql`; `src/lib/__tests__/contrato-tabla.test.ts`, `esquema.test.ts` | Primero la opción `--simular` de `ensayar.mjs`: tras los archivos pendientes, en la misma transacción, corre `rls-simulacion.sql` (su `begin` es solo un aviso dentro de una transacción abierta y su error final deshace todo) y muestra el resultado como `simular.mjs`; se comprueba con el esquema ya aplicado que da el mismo resultado que `simular.mjs`. Después el esquema de las secciones 2 a 4 (requisitos: núcleo 00 a 09 con `00b`, `09b` y `09c`), las comprobaciones 19 a 26 y la sección 19, iterados con `ensayar.mjs --simular` hasta que la sección 19 salga entera en OK. Solo entonces se commitea y el usuario lo aplica con `aplicar.mjs` |
| 3 | `src/lib/modulos.ts`, `src/types.ts`, `docs/modulos.md` (regenerado con `node tools/producto/documentar-modulos.mjs`) | Entrada del registro de 3.1 con estado `disponible`; los dos permisos en el catálogo del shell sin `manage_products` |
| 4 | `src/modulos/productos/` (ver abajo) | Pantallas y lógica |
| 5 | `docs/origen.md`, `docs/glosario.md`, `docs/esquema.md`, `AGENTS.md` | Origen, glosario, convención «Unidad y factor en las líneas», PP-DEC nuevas |

Archivos de `src/modulos/productos/`:

| Archivo | Qué |
|---|---|
| `rutas.tsx` | `ModuloShell`: rutas perezosas, búsqueda de Ctrl+K y la pestaña de Administración de clases de impuesto |
| `RutasProductos.tsx` | `index` (lista), `catalogos`, `:id` (ficha) |
| `productos.css` | Solo lo que no da el shell |
| `lib/tipos.ts` | `Producto`, `Categoria`, `Unidad`, `ClaseImpuesto`, `Conversion`, `Cambio` |
| `lib/datos.ts` | Lecturas y escrituras con supabase-js, `traducirError` por pista |
| `lib/filtros.ts` | Filtros de la URL y parámetros de `productos_buscar` |
| `lib/codigo.ts` | `normalizarCodigo` y `esCodigoValido`, iguales a la base |
| `lib/categorias.ts` | Árbol, ruta «A / B» y su lectura |
| `lib/conversiones.ts` | Lectura y escritura de `caja=12 \| paquete=6`, regla del factor exacto y texto «1 g = 0,001 kg» |
| `lib/importador.ts` | Mapeo de encabezados y filas al formato de `productos_importar`, repetidos sobre el archivo entero y `TAMANO_LOTE` |
| `lib/exportador.ts` | Paginación de la exportación, filas del CSV y plantilla |
| `paginas/Productos.tsx`, `FichaProducto.tsx`, `FormProducto.tsx`, `Catalogos.tsx`, `Importar.tsx`, `Exportar.tsx` | Pantallas de la sección 5 |
| `admin/ImpuestosProductos.tsx` | Pestaña de Administración |
| `lib/__tests__/codigo.test.ts`, `categorias.test.ts`, `conversiones.test.ts`, `importador.test.ts`, `exportador.test.ts`, `filtros.test.ts` | Lógica pura; la de código con los mismos casos que 19.2, 19.3 y 19.19 |
| `__tests__/productos.render.test.tsx` | Render estático: sin `edit_productos` no hay Nuevo producto ni Importar; Exportar con `app_productos`; Borrar solo administrador; cargando y vacío |

Pruebas que cambian fuera del módulo:

- `src/lib/__tests__/contrato-tabla.test.ts`: `EXENTAS` suma `productos_cambios` y `productos_lineas` («registro interno: solo lo escribe productos_aplicar_linea, que ejecuta el dueño»); `PARCIALES` suma `productos_conversiones.archivado_en` («una conversión se quita, no se archiva: las líneas que la usaron guardan su propio factor»).
- `src/lib/__tests__/esquema.test.ts`: bloque `esquema: 22-catalogo` con: cada tabla del registro crea su tabla y lleva `aplicar_politica_modulo(…, array['productos'])`; las únicas `security definer` son `productos_preparar` y `productos_registrar_cambio`; la lista de `productos_puede_leer()`, tomada de su última definición entre `22-catalogo.sql` y los `22b…`, es igual a los módulos con `'productos'` en `depende`; ningún archivo de esquema fuera de `22-catalogo.sql` declara una columna `producto_id` en un `create table` sin llamar `productos_aplicar_linea` para esa tabla; ningún grant ni política para `anon`; y los textos de la sección 19 de la simulación (como hoy con la 15).
- `tools/instalar/__tests__/`: la opción `--simular` de `ensayar.mjs` arma el texto en el orden pendientes y simulación, y no registra huellas.
- `src/lib/__tests__/modulos.test.ts` ya exige que un módulo `disponible` tenga su `sql` en `supabase/esquema`; `rutas-modulos.test.ts` y `tablas-modulo.test.ts` cubren `rutas.tsx` y las consultas del shell.
- `formularios-neutros.test.ts` y `neutralidad.test.ts` cubren los campos y los textos nuevos sin cambios.

Documentos:

- `docs/origen.md`: fila en «Portes de módulo» (productos, 0.7, hash de team-portal leído, fecha, notas de la sección 8) y filas en «Divergencias de esquema» (sección 8).
- `docs/glosario.md`: los términos de 7.1.
- `docs/esquema.md`: sección «Unidad y factor en las líneas» con la tabla de 2.6, la regla del factor exacto y `productos_aplicar_linea`.
- `AGENTS.md`: PP-DEC con las decisiones técnicas de la sección 1 y las de negocio que el usuario fije.

### 7.1 Glosario

| Término | Definición | No decir |
|---|---|---|
| Producto | Lo que la instalación compra, vende o presta: un bien o un servicio con código (`productos`) | artículo, ítem, SKU, referencia (en el código) |
| Código | Identificador del producto, único y normalizado | referencia, SKU |
| Categoría | Nodo del árbol en el que se clasifican los productos | familia, grupo, línea |
| Unidad base | La unidad menor en la que se cuenta el producto, a la que se refieren el precio de lista y todo factor | UOM, unidad de stock |
| Unidad alterna | Otra unidad en la que se compra o vende el producto, con su factor | presentación, empaque (en el código) |
| Factor de conversión | Cuántas unidades base hay en una unidad alterna; 1 o más, o el inverso de un entero | multiplicador, equivalencia (en el código) |
| Clase de impuesto | Clave del catálogo que dice qué impuesto lleva el producto por defecto | tarifa (es un dato de la clase), IVA del producto |
| Porcentaje (de la clase) | La tarifa de una clase de impuesto, copiada en cada línea al crearse | tarifa_pct |
| Precio de lista | Precio general de venta del producto por unidad base, en la moneda base, sin impuestos | precio base, PVP |
| Línea | Fila de un documento o movimiento que cuenta un producto en una unidad, con sus copias congeladas | renglón, detalle (en el código) |

## 8. Qué se portó del origen y qué se descartó

Leído en team-portal (ruta en `AGENTS.md`, «Origen del código») en el hash **de7ef68**, sin tocar su árbol ni su `.env`. Quien implemente vuelve a leer en el hash de ese momento y anota ese hash en `docs/origen.md`.

| Ruta leída | Qué se porta (idea o estructura, neutralizada) | Qué se descarta y por qué |
|---|---|---|
| `supabase/migration-55-catalogo-productos.sql` | Catálogo propio buscable desde los documentos; historial del precio escrito solo por trigger; sin borrado normal, se archiva | Lista literal de marcas en un check y unicidad por marca y código (rubro de origen); `moneda` fija entre tres valores (va el par de PP-DEC-24); `precio_lista numeric` sin dominio; `potencia` y `flujo` (atributos del rubro); bucket público de fotos (fuera de alcance); lectura para todo miembro sin módulo |
| `supabase/migration-59-esseci-precios-voltaje.sql` (leída por lo que de ella describen la 91 y la 92) | Nada | Códigos y precio por voltaje: son del rubro; si vuelve algo parecido, son variantes |
| `supabase/migration-91-catalogo-base.sql` | `pg_trgm` en `extensions` con índices gin y bloque 0 que aborta si está en otro esquema; búsqueda paginada con total, escape de comodines y tope (`productos_buscar`); familias con padre como árbol de categorías; historial `product_cambios` con solo los campos cambiados; bloque 0 de requisitos | Marcas y su resolución por alias; `estado` con descontinuado y reemplazado (el alcance es activo o archivado, con `archivado_en`); `reemplazado_por`; `atributos_def` y `atributos jsonb` (los generaliza BL-42); `product_lotes` como lote de importación (el nombre choca con los lotes de inventario; la auditoría registra cada importación); la compresión del historial por lote reciente; lectura de familias para todo miembro |
| `supabase/migration-92-variantes-y-listas.sql` | Como puerta para el futuro: la llave compuesta `(variante_id, producto_id)` que garantiza que la variante es del mismo producto, y la lista de precios con vigencia y una predeterminada | Variantes, listas por marca y proyección a columnas legadas: fuera de alcance y atadas a marcas |
| `supabase/migration-93-documentos-producto.sql` (encabezado) | Nada | Bucket público de documentos: fuera de alcance; si llega, privado |
| `public/apps/productos/importador.js` (encabezado, `normalizarCodigo`, `numero`) | Código en mayúsculas sin espacios; lectura de números con coma decimal y punto de miles (`leerDecimal`), aquí con el separador elegido por el usuario en lugar de adivinarlo; «una celda vacía no cambia el valor guardado»; prefijo `EJEMPLO-` para la fila de la plantilla | Libro de varias hojas y lista de proveedor con sufijos (rubro); tope de 30 000 filas (aquí 20 000 hasta medir); la detección automática del formato inglés, ambigua con tres cifras tras el punto |
| `public/apps/productos/logica.js` (encabezado), `exportador.js` (encabezado), `app.js` (índice de funciones) | Parámetros vacíos van en null al RPC; columnas fijas del exportador en orden estable para reimportar | La app en iframe con scripts clásicos: el producto usa React (`src/modulos/productos/`) |

Divergencias de esquema que se anotan en `docs/origen.md`:

| Objeto | team-portal | Producto |
|---|---|---|
| `products` | inglés, marca obligatoria, moneda de tres valores | `productos`, sin marca, precio como par por unidad base en la moneda base |
| `familias` | por marca, lectura libre | `productos_categorias`, sin marca, tres niveles, lectura con `productos_puede_leer()` |
| `product_price_history` y `product_cambios` | dos historiales | `productos_cambios`, uno solo, también de conversiones y catálogos |
| `product_lotes` | lotes de importación | no viaja (auditoría por importación) |
| `products.estado`, `activo` | cuatro estados más booleano | `archivado_en` del contrato |
| `manage_products` | un permiso para todo | `app_productos` y `edit_productos`; impuestos solo administrador |
| unidades, impuestos y líneas | no existen | `productos_unidades`, `productos_impuestos`, `productos_lineas` y `productos_aplicar_linea` |

## 9. Decisiones de negocio que necesitan al usuario

Solo las que dependen de cómo trabaja el cliente. Las técnicas están fijadas en la sección 1. La moneda del precio de lista no se pregunta: la fijó PP-DEC-24 (una moneda por instalación). Las marcadas «antes del paso 2» cambian el esquema y su respuesta va antes de escribir `22-catalogo.sql`; las demás se implementan con la recomendada y se cambian después a bajo costo.

### 9.1 Código del producto: manual, automático o ambos

- a) Siempre lo escribe el usuario.
- b) Siempre lo pone el sistema (`P-00001`).
- c) Lo escribe el usuario y, si lo deja vacío, lo pone el sistema.
- **Recomendación: c**, con prefijo `P-` y cinco cifras sin reinicio. Una pyme que migra trae sus códigos; una que empieza no los tiene.
- Si se cambia después: el prefijo y el relleno se cambian en la serie sin tocar datos; pasar a a) o b) es un cambio de pantalla y del trigger, sin migración.

### 9.2 Forma del código (antes del paso 2)

- a) Mayúsculas y sin ningún espacio; solo letras A a Z, cifras y `. _ / -`. «TUBO 1/2"» se rechaza por la comilla y «tubo 1/2» queda «TUBO1/2».
- b) Mayúsculas, espacios de los extremos recortados y los interiores reducidos a uno; se admiten tildes, `Ñ` y espacios. «ÑAME 01» se conserva.
- c) Tal como lo escriba el usuario, distinguiendo mayúsculas.
- **Recomendación: a.** El origen perdió códigos por una minúscula o un espacio, y el código viaja a CSV, a lectores y a sistemas de terceros. La vista previa del importador muestra cada código normalizado antes de escribir.
- Si se cambia después: relajar la regla (a a b) es cambiar el check y la normalización en un `22b`, sin tocar datos; endurecerla obliga a renombrar los códigos que no cumplan.

### 9.3 ¿Un código de un producto archivado puede volver a usarse?

- a) No: el código es único para siempre; recuperarlo es restaurar el producto.
- b) Sí: el código es único solo entre los activos.
- **Recomendación: a.** Un mismo código con dos productos distintos confunde reportes, documentos viejos y lectores.
- Si se cambia después: de a a b es cambiar el índice único por uno parcial, sin datos que tocar; de b a a no se puede si ya hay códigos repetidos.

### 9.4 ¿El precio de lista incluye el IVA? (antes de abrir Ventas)

- a) Sin IVA: el impuesto se suma en el documento.
- b) Con IVA incluido: el documento lo descuenta para obtener la base.
- c) Por producto, con una marca «incluye impuesto».
- **Recomendación: a.** Es como factura un negocio entre empresas y lo que espera la factura electrónica; un comercio al detal puede mostrar el precio con IVA en pantalla sin guardarlo así.
- Si se cambia después: c se añade con una columna `precio_incluye_impuesto` con valor por defecto falso, que no reescribe nada. Cambiar el significado de todos los precios de a a b es caro con documentos emitidos (convertir precios y redondeos): por eso se responde antes de la 0.8, no antes de este paso.

### 9.5 Impuestos por producto

- a) Una clase por producto, para venta y compra; si un bien lleva dos impuestos a la vez, la clase se vuelve plantilla con componentes en la 0.9 (2.7).
- b) Una clase de venta y otra de compra (nula: la misma de venta).
- c) Una lista de clases por producto, con su uso (venta, compra o ambos).
- **Recomendación: a.** Cubre el caso común con una sola columna; b es una columna nula que se añade sin reescribir datos y c casi no aporta sobre a con plantillas. Qué bienes llevan IVA e INC a la vez lo confirma el asesor contable.
- Si se cambia después: b cuesta un `add column` y su campo en el formulario, el importador y el exportador; c, una tabla hija y migrar la columna.

### 9.6 ¿Se marca qué productos se venden y cuáles se compran? (antes del paso 2)

- a) Sí: `vendible` y `comprable`, ambos verdaderos por defecto; los selectores de Ventas y Compras filtran por ellos.
- b) No: todo producto aparece en ambos selectores.
- **Recomendación: a.** Un insumo de obra no debería salir en una cotización ni un servicio que solo se presta en una orden de compra; son dos columnas y un parámetro de búsqueda.
- Si se cambia después: añadirlas es barato en datos, pero cambia la firma de `productos_buscar` en un `22b`.

### 9.7 Mercado y clases de impuesto sembradas (D-17)

- a) Solo Colombia por ahora: el esquema siembra las cuatro clases de 2.2 con claves neutras y tarifas colombianas editables; el INC se añade como una fila para el cliente que lo venda.
- b) Varios países desde ya: el esquema no siembra tarifas y el instalador aplica un archivo de datos por país (`supabase/esquema/datos/impuestos-<país>.sql`) que elige la predeterminada.
- **Recomendación: a**, como recomienda D-17 en `comparativa.md`. Las claves neutras no cierran b: un archivo de datos por país puede reemplazar a la semilla cuando haya un cliente fuera de Colombia.
- Si se cambia después: pasar a b es mover la semilla a un archivo de datos y enseñar al instalador a aplicarlo; las claves y los productos no cambian.

## 10. Riesgos y lo que queda para Inventario

### Riesgos

| Riesgo | Qué se hace |
|---|---|
| La lista de `productos_puede_leer()` se desalinea del registro al añadir un módulo que dependa del catálogo | La prueba de `esquema.test.ts` la compara con los dependientes directos, leyendo la última definición; un dependiente nuevo exige un `22b` que reescriba la función |
| Un módulo crea una tabla de líneas sin `productos_aplicar_linea` y deja la unidad base sin guarda | La comprobación 24 y la prueba de `esquema.test.ts` lo detectan |
| El `statement_timeout` del rol `authenticated` (8 s por defecto en Supabase; se confirma con `select rolconfig from pg_roles where rolname = 'authenticated'` en la base de pruebas) corta un lote de importación con triggers, historial y auditoría por fila | Caso 19.21 con 500 filas; `TAMANO_LOTE` se fija en la mitad del tamaño que quepa en 4 s y se anota la medición en el commit del paso 2. La exportación pagina de 200 en 200 y no tiene ese riesgo |
| Todo el que lee el catálogo ve el precio de lista, también desde un módulo dependiente | Aceptado: el precio de lista es el que se ofrece. El costo no se guarda aquí; cuando llegue, con permiso por campo (BL-43) |
| Una importación a medias si un lote falla después del simulacro (otro usuario cambió algo entre medias) | Cada lote es atómico y el reporte dice cuáles se escribieron; reimportar el archivo da «sin cambio» en lo ya escrito |
| Código único entre archivados: un cliente no puede reusar un código | Restaurar el producto archivado; decisión 9.3 |
| Si llegan variantes, la unicidad del código debe abarcar `productos` y `productos_variantes` | Cuando lleguen: índice único en cada tabla más un trigger que mire la otra, o una tabla de códigos común; decidirlo en esa fase |
| Las tarifas sembradas son datos normativos que cambian por norma | Se confirman con el asesor contable; las líneas copian el porcentaje; Facturación las lleva a filas con vigencia (D-17, BL-61) |
| `codigo_dian` de unidades vacío hasta la 0.9 | Facturación lo carga desde el anexo técnico vigente y falla cerrado si un producto facturado tiene una unidad sin código |
| El administrador cambia `moneda_base` con productos ya con precio | Los precios conservan su moneda (el par lo dice), el producto se sigue editando, Ventas no propone precio en otra moneda y la comprobación 26 avisa cuántos hay |
| La regla del factor exacto rechaza un factor físico menor que 1 que no es el inverso de un entero (libra internacional en un producto en `kg`) | Se usa como base la unidad menor (`g`, factor 453.592). Si un cliente con productos a granel lo sufre, se reabre la tabla global de factores entre magnitudes físicas |
| El historial crece sin plazo de retención y sobrevive al borrado | Sin datos de personas no hay obligación de suprimir; si pesa, se define retención con el usuario |
| El paso 1 toca el importador del CRM, que ya usa un cliente | Movimiento sin cambio de comportamiento; las pruebas del CRM pasan antes y después y se recorre su importador a 1280 y 375 px |

### Lo que queda para Inventario (y Compras)

- `seguimiento` (ninguno, lote, serie) e `inventariable` en `productos`, con un check que impida que un servicio sea inventariable; bandera que no cambia tras el primer movimiento (`item.py` de ERPNext lo hace con lotes y seriales). Que `tipo` no cambie con movimientos lo pone ese mismo archivo, usando `productos_lineas`.
- Las tablas de movimientos y líneas se crean con `productos_aplicar_linea`; la negativa a cambiar la unidad base con movimientos ya la da `productos_preparar` (como `check_stock_uom_with_bin` de ERPNext).
- Validación de decimales por unidad (`productos_unidades.decimales`) en las cantidades.
- Unidad de compra y de venta por defecto por producto, si Compras o Ventas las piden.
- Costo promedio, bodegas, libro de movimientos, conteo inicial y reposición (BL-53 a BL-55), fecha de bloqueo (BL-69a).
- Puente compras con inventario (BL-01b) cuando ambos existan.

## 11. Revisión del diseño

Dos críticos independientes (lentes «datos y seguridad» y «producto y futuro») revisaron la primera versión el 2026-11-19. Cada objeción se comprobó contra el código de la rama (`21-crm.sql`, `21d-crm-contrato.sql`, `02-auditoria.sql`, `04-instalacion-modulos.sql`, `09b-numeracion.sql`, `contrato-tabla.test.ts`, `src/lib/modulos.ts`, `tools/instalar/`) y el documento se reescribió entero con el resultado.

| Objeción | Veredicto | Qué cambió |
|---|---|---|
| Historial con FK `on delete cascade` y trigger AFTER DELETE: el borrado falla con 23503 | Aceptada | Confirmado: `crm_cambios.entidad_id` no tiene llave. `productos_cambios.entidad_id` sin llave; el historial sobrevive al borrado con una fila `delete` completa; 19.10 lo comprueba (2.8) |
| Unidad base cambiable sin conversiones aunque haya precio o líneas; precio sin unidad; negativa delegada a Inventario | Aceptada | Precio de lista por unidad base; el cambio de unidad base exige sin conversiones, sin precio y sin líneas; registro `productos_lineas` consultado por `productos_preparar`; comprobación 24 (2.4, 2.6) |
| `tarifa_pct` choca con `NOMBRE_DINERO` | Aceptada | Confirmado: el patrón incluye `tarifa` y `columnasDe` lee `numeric`. Columna `porcentaje` y, en las líneas, `porcentaje_impuesto` (2.2, 2.6) |
| `productos_factor` en `language sql` no puede levantar error con pista | Aceptada | `plpgsql stable security invoker` con `search_path`; la comprobación 19 exige `plpgsql` (4.4) |
| `sistema` escribible por la API; `codigo_dian` editable por un editor | Aceptada | Grants por columna en `productos_unidades` sin `sistema` ni `codigo_dian`; `sistema` quitado de impuestos; casos en 19.11 y comprobación 21 (2.1, 2.2) |
| La moneda se valida en todo update y contra `moneda_base` sola | Parcial | Se valida solo en el alta o si cambian precio o moneda. Se descarta validar contra `divisas`: D-15 opción a es una moneda por instalación y Ventas no tendría tasa. Cambio de `moneda_base` documentado con AVISO 26 (2.4, 10) |
| Árbol: profundidad de descendientes, ciclos concurrentes, CTE sin tope | Aceptada | Bloqueo `pg_advisory_xact_lock`, altura del subárbol, `union` con tope de nivel; caso 19.13 y comprobación 25 (2.3) |
| Simulacro por lote sin ver otros lotes, gasta números, conversiones reescritas, sin tiempo medido | Aceptada | Repetidos sobre el archivo entero en el navegador y en cada lote; marcador `SIM-` sin serie; diferencias de conversiones; lote medido con el `statement_timeout`; la vista previa no garantiza el resultado (4.3, 5.5, 10) |
| `auditar_cambio` deja `entity_id` vacío y sin valores en los catálogos con clave | Aceptada | Confirmado en `02-auditoria.sql` línea 176. Los catálogos llevan su historial con clave y antes y después en `productos_cambios`; sin `auditar_cambio` (2.8) |
| Contrato de línea solo en prosa; factor 1/12 inexacto | Aceptada | `productos_aplicar_linea` con columnas, llaves, trigger y registro, y prueba que lo exige; regla del factor exacto con base en la unidad menor (2.5, 2.6, 4.5) |
| «Aplicado» antes de probar obliga a un `22b` el primer día; lista de lectura contra `dependientesDe` transitiva | Aceptada | Confirmado: `dependientesDe` incluye `cartera`. Definición de «aplicado», `ensayar.mjs --simular` (sobre el ensayo de 0.7.1) y pasos 2 y 3 fundidos; lista de dependientes directos, leída de la última definición (Reglas, 3.2, 7) |
| Impuesto por defecto en update, prefijo de serie inválido, 20 colisiones, cero predeterminadas | Parcial | Default de impuesto solo en el alta; normalizar y validar después de pedir a la serie; bucle hasta un número libre con tope `count(*) + 1` (se descarta mover la secuencia con un máximo: `docs/esquema.md` no admite `setval`); trigger diferido de exactamente una predeterminada y `productos_impuesto_predeterminar` (2.2, 2.4) |
| Guardas sin bloqueo entre unidad base y conversiones | Parcial | `for share` en `productos_conversiones_validar` y en `productos_linea_preparar`; índice sobre `productos_conversiones(unidad)`. Se descarta el `for update` de conversiones en `productos_preparar`: el bloqueo de fila del propio `update` ya choca con `for share` (2.4, 2.5) |
| `leerDecimal` ambiguo con tres cifras tras el punto | Aceptada | Separador decimal explícito en el diálogo, sin adivinar; vista previa de la relación «1 g = 0,001 kg» (5.5) |
| Código repetido dentro del archivo, entre lotes o por normalización | Aceptada | Detección sobre el archivo entero y en cada lote; colisión por normalización reportada aparte; caso 19.19 (4.3, 5.5) |
| Unidad base cambiable con líneas de Ventas o Facturación sin Inventario | Aceptada (otro mecanismo) | El registro `productos_lineas` en lugar de una bandera `unidad_base_fija`: no exige que cada línea actualice el producto con permisos que el vendedor no tiene; `tipo` queda para Inventario (2.6, 10) |
| Precio de lista sin unidad; paso a precio de línea indefinido | Aceptada | Precio por unidad base; la línea propone `precio_lista * factor`; puerta del precio propio por unidad alterna (1, 2.4, 2.6) |
| Clave `iva_19` con la tarifa; semilla colombiana para todos; D-17 sin preguntar | Parcial | Claves neutras y sin `sistema`; D-17 pasa a la decisión 9.7. Se descarta sembrar desde un archivo por país ahora: D-17 está abierta y recomienda solo Colombia; las claves neutras no cierran esa vía |
| «Impuestos por defecto» reducido a una columna; afirmación normativa sin fuente | Parcial | Decisión 9.5 para el usuario; la clase como plantilla para combinaciones; afirmación quitada y remitida al asesor (2.7). Se mantiene una columna como recomendación |
| La línea no congela el impuesto | Parcial | La línea con impuesto copia clase y porcentaje; tipo y tratamiento inmutables en la clase. Se descarta bloquear el cambio de porcentaje de una clase en uso: con la copia no hace falta. El código DIAN lo copia Facturación al publicar (2.2, 2.6) |
| Factor 1/12 en `numeric(18,6)` | Parcial | Regla del factor exacto en lugar de `numeric(28,12)`: con más decimales cada línea seguiría redondeada a 6 y doce líneas de 1 und seguirían sin sumar una caja (2.5) |
| Permiso `exportar_productos` sin tope en la lectura directa no cierra nada | Aceptada | Sin permiso ni función de exportación; exportar pagina `productos_buscar` con `app_productos` (3.1, 5.6) |
| Decisiones mal repartidas entre usuario y técnicas; regla de agentes contradictoria | Aceptada | Forma del código, código archivado, impuestos y mercado pasan a la sección 9; permiso único y profundidad pasan a decisiones técnicas; regla de agentes con «antes del paso 2»; 9.4 se responde antes de Ventas y c es una columna con defecto (Reglas, 1, 9) |
| Faltan «se vende» y «se compra»; `returns table` cerrada | Parcial | `productos_buscar` devuelve la fila compuesta y admite columnas nuevas sin recrearse; las banderas son la decisión 9.6 con recomendación sí, porque el usuario no las fijó en el alcance (2.4, 4.2) |
| El borrado físico no deja rastro: falta `auditar_cambio` en `productos` | Aceptada | Confirmado: el CRM lo tiene en `crm_cuentas` y `crm_contactos`. `auditar_cambio` AFTER DELETE en `productos`, comprobación 20 y caso 19.10 (2.8) |
| El simulacro y las colisiones queman números de la serie | Aceptada | Marcador `SIM-` en el simulacro y bucle hasta un número libre (2.4, 4.3); caso 19.17 comprueba la secuencia |
| Lote de 500 sin medir contra el `statement_timeout` | Aceptada | `TAMANO_LOTE` constante del cliente, 100 por defecto, fijado por el caso 19.21 (4.3, 10) |
| Sin conversiones globales entre magnitudes físicas | Parcial | Anotado en el alcance y en riesgos como reapertura con el primer cliente a granel; no se construye, como pidió el propio crítico (1, 10) |
| Campo de unidad base deshabilitado con el motivo en el título | Aceptada | El campo queda editable y el error de la base sale junto al campo (Reglas, 5.3) |
