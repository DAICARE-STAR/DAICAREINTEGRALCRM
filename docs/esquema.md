# Convenciones de esquema

Reglas que debe cumplir toda tabla nueva de un módulo en `supabase/esquema`. Las funciones están en `00b-contrato-tabla.sql`; las vigilan `src/lib/__tests__/contrato-tabla.test.ts` (sin base de datos), las comprobaciones 15 y 16 de `verificar.sql` y la sección 16 de `supabase/pruebas/rls-simulacion.sql`. La numeración y los estados de los documentos están en `09b-numeracion.sql` y `09c-estados.sql`; los vigilan `src/lib/__tests__/numeracion-estados.test.ts`, las comprobaciones 17 y 18 y las secciones 17 y 18.

## Contrato base de tabla (PP-DEC-23)

Toda tabla de negocio de un módulo lleva estas columnas y el trigger `zz_contrato_sellar` (función `contrato_sellar`):

| Columna | Tipo | Quién la escribe |
|---|---|---|
| `created_by` | `uuid` | el trigger, con `auth.uid()` en el alta; no cambia |
| `updated_by` | `uuid` | el trigger, con `auth.uid()` en cada alta y cambio |
| `created_at` | `timestamptz not null` | el trigger, `now()` en el alta; no cambia |
| `updated_at` | `timestamptz not null` | el trigger, `now()` en cada alta y cambio |
| `creado_via` | `via_creacion not null` | quien inserta: `manual` (por defecto), `importacion`, `api`, `regla` o `sistema`; no cambia |
| `archivado_en` | `timestamptz` | quien archiva; null es activo |

- Lo que el cliente mande en autoría y fechas se ignora. Sin sesión (service role, instalador, SQL Editor) `auth.uid()` es null y la autoría queda null.
- El trigger se llama `zz_contrato_sellar` para dispararse el último de los BEFORE de la tabla: Postgres los ordena por nombre y uno posterior podría reescribir lo sellado. Ningún trigger BEFORE puede llevar un nombre posterior; lo rechazan `contrato-tabla.test.ts` y la comprobación 15 de `verificar.sql`.
- `creado_via` describe el canal; no es una garantía de seguridad: un miembro puede declarar `importacion`.
- No se llama `origen`: en el CRM `origen` es el canal de captación de una cuenta.
- El archivo del módulo, después de crear la tabla, llama a `select public.contrato_aplicar('public.<tabla>');`. La función añade las columnas que falten con su valor por defecto, comprueba el tipo de las que ya estaban y pone el trigger. Solo la ejecuta el dueño de la base (el instalador).
- Una tabla puede omitir `created_by` (tiene su propia columna de autor) o `archivado_en` (no se archiva) con `contrato_aplicar('public.<tabla>', array['created_by'])`; el motivo se anota en `PARCIALES` de la prueba. Hoy: `crm_actividades` (autor en `autor_id`; una actividad se borra, no se archiva).
- Exentas, con su motivo en `EXENTAS` de la prueba: historial, registros de acceso, configuración y datos que solo escriben funciones propias. Hoy: `crm_campos_def`, `crm_cambios`, `crm_vinculos_externos`, `crm_salud`, `crm_consentimientos` y `crm_accesos_salud`.
- Un historial por trigger no anota `updated_by` ni `creado_via` como campos cambiados.
- Las tablas del núcleo (00 a 09) no entran en el contrato.

## Moneda como par (PP-DEC-24)

Un importe son dos columnas que van juntas o vacías:

```sql
total public.importe not null,
total_moneda public.codigo_moneda not null,
constraint <tabla>_total_moneda_check check ((total is null) = (total_moneda is null))
```

- `importe` es `numeric(18,4)` sin NaN: hasta 14 cifras enteras y 4 decimales. `codigo_moneda` es el código ISO 4217 en tres letras mayúsculas, la misma regla de `instalacion.moneda_base`.
- El check de pareja va siempre, también si las dos columnas son obligatorias.
- Dos columnas y no un tipo compuesto: la API filtra, ordena y suma columnas simples; un compuesto llega como objeto y su `not null` no mira los campos.
- La moneda por defecto es `instalacion.moneda_base`: la pone el cliente al escribir. Con una sola moneda por instalación (D-15, opción a) no hay tasas.
- Una columna `numeric` con nombre de dinero (`importe`, `precio`, `valor`, `total`, `saldo`, `costo`, `impuesto`, `descuento`, `pago`…) la rechaza la prueba: va en `public.importe` con su moneda.
- La API entrega el importe como número JSON: el navegador lo lee exacto hasta 15 cifras significativas. Un módulo con importes de más cifras los lee como texto (`select('total::text')`) y los valida como cadena: `validarImporte` cuenta las cifras del texto. Un número con más de 4 decimales (una suma hecha en el navegador, 0.1 + 0.2) se redondea a 4, como al guardarse en la base.
- En el navegador: `esCodigoMoneda`, `validarImporte` y `fmtImporte` de `src/lib/moneda.ts` (formato es-CO, «COP $ 1.234.567»).

## Numeración de documentos (PP-DEC-25)

Un consecutivo sale de una serie de `public.series` (`09b-numeracion.sql`) con `series_siguiente(clave, fecha)`, nunca de un `max() + 1` en el navegador ni en una función.

| Columna | Qué |
|---|---|
| `clave` | nombre de la serie (`factura`, `cotizacion`): minúsculas, cifras y `_`, hasta 40 |
| `prefijo`, `relleno` | `'F-'` y 4 dan `F-0001`; un número más largo que el relleno no se corta |
| `actual` | último número entregado de una serie sin huecos; solo lo escribe `series_siguiente` |
| `tope` | último número permitido (rango de una resolución); null es sin tope |
| `vigente_desde`, `vigente_hasta` | fechas en las que la serie numera; null es sin límite |
| `reinicio` | `nunca`, `anual` o `mensual`; con reinicio el número lleva el periodo: `COT-2026-0001` |
| `modo` | `con_huecos` o `sin_huecos`; se fija al crear la serie |

- `con_huecos` (cotizaciones, pedidos): cada serie tiene su secuencia `serie_<clave>`; no bloquea a nadie y un número entregado no vuelve aunque la transacción se deshaga.
- `sin_huecos` (lo fiscal): bloquea la fila de la serie dentro de la transacción del documento; si esa transacción se deshace, el número también. Espera hasta 2 s (`lock_timeout`) a que termine otro documento y luego falla con la pista `series_ocupada`.
- Fuera de vigencia (`series_fuera_de_vigencia`), con el tope agotado (`series_agotada`) o con una fecha de un periodo ya pasado (`series_periodo`) no entrega número: el documento no se publica.
- El número fiscal se asigna al publicar, no al crear el borrador. La función `security definer` que publica el documento pide el número en la misma transacción en la que cambia su estado:

```sql
update public.<documentos>
   set numero = public.series_siguiente('<serie>', fecha)
 where id = p_id;
```

- Una serie sin huecos no se pide suelta por la API (`/rpc/series_siguiente`): quedaría un número sin documento. `series_siguiente` solo la ejecutan la service role y las funciones `security definer`.
- Quien tiene `gestionar_series` (un administrador por serlo) ve las series, crea una y cambia prefijo, relleno, tope y vigencia. Nadie escribe `actual` ni `periodo` por la API, tampoco un administrador. En una serie con huecos `actual` queda en 0: el último número está en su secuencia.

## Máquina de estados (PP-DEC-26)

Los estados de un documento se declaran como datos (`09c-estados.sql`) y cambian solo con `aplicar_transicion`:

- `estados_entidades`: la entidad (`factura`) y su tabla, que lleva `id uuid` y `estado text`. Se registra con `select public.estados_registrar('factura', 'public.facturas');` desde el archivo del módulo; solo la ejecuta el dueño.
- `estados`: clave, nombre, categoría fija (`borrador`, `en_curso`, `aprobado`, `hecho` o `anulado`), orden y un solo `inicial` por entidad.
- `estados_transiciones`: desde, hacia y el permiso que exige (`has_perm`). Lo que no está en la tabla no se puede hacer.
- `aplicar_transicion(entidad, id, desde, hacia)` comprueba la transición y el permiso, hace `update … where id = … and estado = desde` y exige exactamente una fila: si no, error `40001` con la pista `estados_conflicto` (otro lo cambió antes, no existe o la RLS no lo deja cambiar) y la pantalla recarga. Cada cambio deja una fila `estados.transicion` en `audit_log`. Es `security invoker`: la RLS de la tabla del documento decide quién lo toca, y quien llama necesita `update` sobre su columna `estado`.
- El trigger `estados_guardia` obliga a crear el registro en el estado inicial y rechaza cualquier `update` del estado que no venga de `aplicar_transicion`. Un administrador tampoco se salta una transición que no está en el catálogo (D-9); sin sesión (service role, SQL Editor) no hay permiso y nada cambia.
- Las pantallas leen los tres catálogos para pintar el estado y los botones; la API no los escribe.
