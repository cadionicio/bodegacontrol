# BodegaControl V6 — Diccionario de datos

**Motor:** PostgreSQL 16+ · **Esquema:** `bc` · **Zona horaria de negocio:** America/Lima (fechas guardadas en `TIMESTAMPTZ`, UTC interno)

## Archivos de la carpeta `base-datos/`

| Archivo | Qué hace | Cuándo se ejecuta |
|---|---|---|
| `01_esquema.sql` | Crea el esquema `bc`: 10 tablas, restricciones, índices, 8 funciones/triggers, 6 vistas y los 2 roles. Todo en una transacción: si una línea falla, no queda nada a medias. | Una vez, sobre una base vacía (local o Neon). |
| `02_datos_iniciales.sql` | Crea los 2 usuarios de demostración (hash bcrypt real) y 8 productos con su stock de apertura registrado como movimiento `ALTA`. | Después de `01`. |
| `03_pruebas_esquema.py` | 42 casos automáticos: 8 operaciones válidas que deben aceptarse, 33 inválidas que deben rechazarse y la conciliación del stock. Cada caso se revierte; la base queda intacta. | Después de `02`, y cada vez que se cambie el esquema. |
| `04_modelo_er.mmd` / `.png` | Diagrama entidad-relación (fuente Mermaid e imagen). | Se regenera la imagen si cambia el esquema. |
| `DICCIONARIO_DE_DATOS.md` | Este documento. | — |

**Orden de instalación:** `01_esquema.sql` → `02_datos_iniciales.sql` → `python 03_pruebas_esquema.py` (debe terminar en `42/42`).

## Convenciones

- **Identificadores** `BIGINT GENERATED ALWAYS AS IDENTITY`: los genera la base; el cliente no puede imponer un ID.
- **Dinero** `NUMERIC(12,2)` o `NUMERIC(14,2)`: decimal exacto. Nunca `FLOAT`, porque `0.1 + 0.2 ≠ 0.3` en coma flotante.
- **Fechas** `TIMESTAMPTZ`: instante absoluto; los reportes lo convierten a hora de Lima.
- **Borrado:** no se borra nada con historia. Los productos, clientes y usuarios se **desactivan** (`activo = FALSE`); las ventas y movimientos son **inmutables**.
- **FK `ON DELETE RESTRICT`:** impide borrar un registro que otro todavía referencia.
- **Nulo = No** significa obligatorio (`NOT NULL`).

---

## 1. `rol` — perfiles de acceso

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `rol_id` | SMALLINT identidad | No | Identificador del rol (PK). | Solo hay 2 roles; `SMALLINT` basta. | `1` |
| `codigo` | VARCHAR(20) | No | Código único: `PROPIETARIO` o `CAJERO`. | El backend decide los permisos según este código. Una lista cerrada impide roles inventados. | `CAJERO` |
| `descripcion` | VARCHAR(90) | No | Explicación legible del rol. | Se muestra en la interfaz. | `Consulta catálogo, registra clientes y ventas` |

**Permisos que aplicará la API:**

| Acción | PROPIETARIO | CAJERO |
|---|---|---|
| Vender y consultar el catálogo | Sí | Sí |
| Registrar clientes | Sí | Sí |
| Crear, editar o desactivar productos | Sí | No |
| Registrar reposiciones y mermas | Sí | No |
| Exportar reportes | Sí | No |

## 2. `usuario` — personas que operan el sistema

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `usuario_id` | BIGINT identidad | No | Identificador (PK). | Lo referencian ventas, pagos, movimientos y reportes. | `2` |
| `rol_id` | SMALLINT → `rol` | No | Rol asignado. | Define los permisos. | `2` |
| `nombre` | VARCHAR(100) | No | Nombre visible; no puede ser solo espacios. | Aparece en tickets, historial y auditoría. | `Giancarlo Aguirre` |
| `correo` | VARCHAR(160) único | No | Usuario de inicio de sesión, en minúsculas y con `@`. | Evita que `Ana@x.pe` y `ana@x.pe` sean dos cuentas. | `giancarlo@uni.pe` |
| `contrasena_hash` | TEXT | No | Hash bcrypt de la contraseña; debe empezar con `$2`. | Si se filtra la base, las contraseñas no son legibles. La base rechaza texto plano aunque el backend falle. | `$2b$12$Qx…` |
| `activo` | BOOLEAN | No (TRUE) | Si puede iniciar sesión. | Dar de baja sin perder sus ventas históricas. | `true` |
| `creado_en` | TIMESTAMPTZ | No (NOW) | Fecha de registro. | Auditoría. | `2026-11-02 09:00-05` |

## 3. `producto` — catálogo

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `producto_id` | BIGINT identidad | No | Identificador (PK). | Referencia estable aunque cambien el código o el nombre. | `1` |
| `codigo` | VARCHAR(32) único | No | Código interno: mayúsculas, dígitos, `_` o `-`, de 2 a 32 caracteres. | Búsqueda rápida y escritura manual en caja. | `P0001` |
| `codigo_barras` | VARCHAR(64) único | Sí | EAN/UPC o contenido de un QR reconocido. | El escáner busca por este campo. Es opcional porque no todo producto tiene etiqueta (ej. el pan). | `7751271001234` |
| `nombre` | VARCHAR(120) | No | Descripción comercial. | Se muestra en catálogo, carrito y reportes. | `Coca-Cola 500 ml` |
| `precio` | NUMERIC(12,2) | No | Precio de venta vigente, mayor que 0. | El servidor lo toma de aquí; nunca confía en un precio enviado por el celular (RN-04). | `3.50` |
| `costo` | NUMERIC(12,2) | **Sí** | Costo de compra vigente, mayor o igual a 0. **NULL = desconocido.** | Calcular la ganancia y valorizar las mermas. Si no se conoce, la ganancia aparece como "sin dato" en vez de inflarse. | `2.60` / `NULL` |
| `stock_minimo` | INTEGER | No (0) | Umbral de alerta, mayor o igual a 0. | Si `stock ≤ stock_minimo`, el producto aparece en "por reponer" en Inicio. | `10` |
| `activo` | BOOLEAN | No (TRUE) | Si se puede vender. | "Eliminar" un producto lo desactiva y se conservan sus ventas. | `true` |
| `creado_en` | TIMESTAMPTZ | No (NOW) | Fecha de alta. | Auditoría. | `2026-11-02 09:00-05` |
| `actualizado_en` | TIMESTAMPTZ | No (NOW) | Última edición; **lo actualiza un trigger**. | Saber cuándo cambió el precio sin depender de que el backend lo recuerde. | `2026-11-02 10:15-05` |

## 4. `inventario_saldo` — stock actual

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `producto_id` | BIGINT PK → `producto` | No | Un saldo por producto (relación 1 a 1). | Consulta de stock sin sumar todo el historial. | `1` |
| `cantidad` | INTEGER | No (0) | Unidades disponibles, siempre ≥ 0 (`ck_saldo_no_negativo`). | Validar las ventas. Si dos cajeros venden la última unidad a la vez, uno falla. | `24` |
| `actualizado_en` | TIMESTAMPTZ | No (NOW) | Último cambio de stock. | Auditoría. | `2026-11-02 10:20-05` |

> **Regla clave:** nadie escribe directamente en esta tabla, ni siquiera el backend. Se crea sola al dar de alta un producto (trigger `tr_producto_saldo`) y cambia solo al registrar un movimiento (trigger `tr_aplicar_movimiento`). Un `UPDATE` o `DELETE` directo es rechazado (`tr_proteger_saldo`). Así el stock **no puede** descuadrarse del historial.

## 5. `cliente` — clientes identificados (opcional)

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `cliente_id` | BIGINT identidad | No | Identificador (PK). | Vincular ventas a un cliente. | `5` |
| `tipo_documento` | VARCHAR(8) | No (`NINGUNO`) | `NINGUNO`, `DNI`, `RUC` o `CE`. | Validar el número según su tipo. | `DNI` |
| `numero_documento` | VARCHAR(24) | Sí | DNI: 8 dígitos. RUC: 11 dígitos que empiezan con 10, 15, 17 o 20. CE: 4 a 24 alfanuméricos. Vacío si es `NINGUNO`. | Evitar documentos mal digitados. El par tipo + número es único: no hay clientes duplicados. | `45879632` |
| `nombre` | VARCHAR(140) | No | Nombre o razón social. | Se muestra en la venta. | `Ana Pérez` |
| `telefono` | VARCHAR(15) | Sí | De 6 a 14 dígitos, con `+` opcional. | Contacto opcional (ej. clientes que piden fiado en el futuro). | `+51987654321` |
| `activo` | BOOLEAN | No (TRUE) | Si se puede seleccionar. | Dar de baja sin perder el historial. | `true` |
| `creado_en` | TIMESTAMPTZ | No (NOW) | Fecha de registro. | Auditoría. | — |

> El **cliente general** no es una fila: es una venta con `cliente_id = NULL`. Así no se crean miles de clientes ficticios ni se piden datos personales innecesarios.

## 6. `venta` — cabecera de la venta

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `venta_id` | BIGINT identidad | No | Número de venta (PK). | Se muestra en el ticket y en el historial. | `123` |
| `usuario_id` | BIGINT → `usuario` | No | Quién vendió; sale de la sesión, no del celular. | Responsabilidad y reportes por cajero. | `2` |
| `cliente_id` | BIGINT → `cliente` | Sí | Cliente identificado; NULL = cliente general. | Historial de compras por cliente. | `NULL` |
| `clave_idempotencia` | UUID único | No | Identificador que genera el celular al pulsar "Confirmar". | Si se cae la red y la app reintenta, la misma clave devuelve la venta ya creada en vez de duplicarla (RN-07). | `04613819-030b-4cb4-9ee2-9c2014b19444` |
| `solicitud_firma` | CHAR(64) | No | SHA-256 en hexadecimal del contenido normalizado (productos, cantidades y pago). | Detectar que una clave se reutiliza con **otro** contenido: la API responde 409. | `9f2c…e1` (64 caracteres) |
| `registrada_en` | TIMESTAMPTZ | No (NOW) | Momento de la venta. | Base de todos los reportes por periodo. | `2026-11-02 18:30-05` |

> **Sin columna `total`:** el total se calcula del detalle (vista `v_venta_resumen`), para que nunca existan dos totales distintos para la misma venta.

## 7. `detalle_venta` — líneas de la venta

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `detalle_id` | BIGINT identidad | No | Identificador de la línea (PK). | Lo referencia el movimiento de salida. | `501` |
| `venta_id` | BIGINT → `venta` | No | Venta a la que pertenece. | Agrupa las líneas. | `123` |
| `producto_id` | BIGINT → `producto` | No | Producto vendido; solo una línea por producto en cada venta (RN-02). | Evita líneas duplicadas que confunden el total. | `1` |
| `cantidad` | INTEGER | No | Unidades, mayor que 0. | Descontar stock y calcular el importe. | `2` |
| `precio_unitario` | NUMERIC(12,2) | No | **Copia** del precio al momento de vender. | Si mañana sube el precio, las ventas de ayer no cambian (RN-04). | `3.50` |
| `costo_unitario` | NUMERIC(12,2) | Sí | **Copia** del costo al momento de vender (NULL si se desconocía). | Ganancia histórica exacta. | `2.60` |

## 8. `venta_pago` — cobro de la venta

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `pago_id` | BIGINT identidad | No | Identificador (PK). | — | `90` |
| `venta_id` | BIGINT único → `venta` | No | Venta cobrada; **un pago por venta**. | El cobro queda ligado a su venta. | `123` |
| `metodo` | VARCHAR(8) | No | `EFECTIVO`, `YAPE`, `PLIN` o `TARJETA`. | Reportes por medio de pago. | `YAPE` |
| `modalidad_tarjeta` | VARCHAR(7) | Sí | `DEBITO` o `CREDITO`; obligatoria solo si es `TARJETA`. | Distinguir comisiones y conciliar con el POS. | `DEBITO` |
| `monto` | NUMERIC(14,2) | No | Igual al total de la venta (lo verifica un trigger al confirmar). | El ingreso real. El vuelto **no** es ingreso (RN-05). | `13.10` |
| `importe_recibido` | NUMERIC(14,2) | Sí | Solo efectivo: lo que entregó el cliente, mayor o igual que `monto`. | Calcular el vuelto (`importe_recibido − monto`). | `20.00` |
| `referencia_externa` | VARCHAR(80) | Sí | Solo Yape, Plin o tarjeta: número de operación (4 a 80 caracteres). Único por método. | Evidencia de un cobro verificado. Una misma operación no puede pagar dos ventas (RN-06). | `YP-48213377` |
| `verificado_por` | BIGINT → `usuario` | No | Quién confirmó el cobro: contó el efectivo o vio la operación en su app o POS. | Responsabilidad sobre cada cobro. | `2` |
| `registrado_en` | TIMESTAMPTZ | No (NOW) | Momento del cobro. | Auditoría. | — |

> **Nunca** se guardan número de tarjeta, CVV, fecha de vencimiento ni claves.

**Por qué el importe recibido está en `venta_pago` y no en `venta` (recomendación):**
1. Es un dato **del cobro en efectivo**, no de la venta. Con Yape no existe "importe recibido".
2. Si estuviera en `venta`, la base no podría validar "obligatorio solo si el pago es en efectivo", porque el método está en otra tabla. En `venta_pago` lo valida una sola regla (`ck_pago_evidencia`).
3. **Un pago por venta** cubre el alcance actual. Si en el futuro se aceptan pagos mixtos (P2), basta con retirar `uq_pago_venta`, sin migrar datos.

**Por qué no existe el estado "DECLARADA":** la venta solo se confirma con el pago ya verificado por el cajero, así que no hay ventas cobradas "a medias". Si el Yape no llega, la venta no se registra y el carrito se conserva en el celular.

## 9. `movimiento_inventario` — libro de entradas y salidas

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `movimiento_id` | BIGINT identidad | No | Identificador (PK). | Orden cronológico exacto. | `1040` |
| `producto_id` | BIGINT → `producto` | No | Producto afectado. | Historial por producto. | `4` |
| `usuario_id` | BIGINT → `usuario` | No | Quién lo registró. | Responsabilidad. | `1` |
| `detalle_id` | BIGINT único → `detalle_venta` | Sí | Solo `SALIDA_VENTA`: la línea de venta que la origina. Junto con `producto_id` forma una FK compuesta. | Trazar cada unidad vendida hasta su venta. No se puede asociar a la línea de **otro** producto. | `501` |
| `tipo` | VARCHAR(12) | No | `ALTA`, `ENTRADA`, `SALIDA_VENTA` o `MERMA`. | Determina si suma o resta (función `variacion_stock`). | `MERMA` |
| `cantidad` | INTEGER | No | Unidades, siempre positivas; el signo lo da el tipo. | Evita errores de signo. | `3` |
| `motivo_merma` | VARCHAR(8) | Sí | Solo `MERMA` y ahí es obligatorio: `VENCIDO`, `DANADO`, `FALTANTE` u `OTRO`. | Agrupar las pérdidas por causa para atacarlas. | `VENCIDO` |
| `costo_unitario` | NUMERIC(12,2) | Sí | Solo `MERMA`: copia del costo del producto al darlo de baja. | Valorizar la pérdida en soles. | `3.90` |
| `referencia` | VARCHAR(120) | Sí | En `ENTRADA` es obligatoria (comprobante de compra). En `MERMA` es la observación: obligatoria solo si el motivo es `OTRO`. En `ALTA` y `SALIDA_VENTA` va vacía. | Evidencia documental. | `Factura F001-123` / `Lote vencido 30/10` |
| `registrada_en` | TIMESTAMPTZ | No (NOW) | Momento del movimiento. | Reconstruir el stock en cualquier fecha. | — |

| Tipo | Efecto en stock | Quién lo genera | Reglas |
|---|---|---|---|
| `ALTA` | Suma | Al crear un producto con stock inicial | Uno solo por producto, sin referencia. |
| `ENTRADA` | Suma | Propietario (reposición) | Referencia obligatoria. |
| `SALIDA_VENTA` | Resta | Al confirmar una venta | Ligado a su línea de venta, con la misma cantidad. |
| `MERMA` | Resta | Propietario | Motivo obligatorio. Observación obligatoria si el motivo es `OTRO`. Se copia el costo. |

**Criterio de mermas (versión básica aprobada):**
- **Solo el PROPIETARIO** las registra, desde Inventario → producto → "Registrar merma".
- Cantidad entera mayor que 0 y no mayor que el stock.
- No se editan. Un error se corrige con una `ENTRADA` con referencia "Corrige merma #id".
- **Indicador para reducirlas:** S/ perdidos por periodo, motivo y producto (vista `v_merma`), y **% de merma = costo de mermas ÷ (costo vendido + costo de mermas)**.

## 10. `reporte_exportacion` — auditoría de reportes

| Atributo | Tipo | Nulo | Descripción | Motivo de uso | Ejemplo |
|---|---|---|---|---|---|
| `exportacion_id` | BIGINT identidad | No | Identificador (PK). | — | `7` |
| `usuario_id` | BIGINT → `usuario` | No | Quién lo generó. | Control de fuga de información (RF-18). | `1` |
| `tipo_reporte` | VARCHAR(10) | No (`VENTAS`) | `VENTAS`, `PRODUCTOS` o `MERMAS`. | Saber qué se exportó. | `MERMAS` |
| `formato` | VARCHAR(3) | No | `PDF` o `CSV`. | — | `PDF` |
| `periodo` | VARCHAR(13) | No | `DIARIO`, `SEMANAL`, `MENSUAL`, `BIMESTRAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`, `TODO` o `PERSONALIZADO`. | Filtros de RF-17. | `MENSUAL` |
| `desde` | TIMESTAMPTZ | No | Inicio del intervalo (incluido). | Reproducir el mismo reporte. | `2026-11-01 00:00-05` |
| `hasta_exclusivo` | TIMESTAMPTZ | No | Fin del intervalo (**excluido**). Debe ser mayor que `desde`. | Con `[desde, hasta)` una venta de 00:00 no cae en dos días (RN-08). | `2026-12-01 00:00-05` |
| `cantidad_filas` | INTEGER | No (0) | Filas incluidas, mayor o igual a 0. | Detectar reportes vacíos. | `154` |
| `generado_en` | TIMESTAMPTZ | No (NOW) | Momento de la generación. | Auditoría. | — |

> Solo se registra la exportación **después** de generar el archivo con éxito. El PDF o CSV no se guarda en la base.

---

## 11. Funciones y triggers (reglas automáticas)

| Nombre | Se dispara | Qué garantiza |
|---|---|---|
| `variacion_stock(tipo, cantidad)` | La usan triggers y vistas | Fuente única del signo: `SALIDA_VENTA` y `MERMA` restan; `ALTA` y `ENTRADA` suman. |
| `tr_producto_saldo` | Después de insertar un producto | Crea su saldo en 0. |
| `tr_producto_actualizado` | Antes de editar un producto | Pone `actualizado_en = NOW()`. |
| `tr_verificar_salida` | Antes de insertar un movimiento | La cantidad de una `SALIDA_VENTA` es igual a la de su línea de venta. |
| `tr_aplicar_movimiento` | Después de insertar un movimiento | Ajusta el saldo en la misma transacción. Si quedaría negativo, aborta todo. |
| `tr_proteger_saldo` | Antes de cualquier cambio en `inventario_saldo` | Rechaza cambios directos; solo los acepta desde los triggers anteriores. |
| `tr_*_inmutable` (4) | Antes de `UPDATE` o `DELETE` en venta, detalle, pago o movimiento | El historial no se altera; los errores se corrigen con operaciones compensatorias. |
| `ct_venta_completa`, `ct_detalle_completo`, `ct_pago_completo` | **Al confirmar (COMMIT)** la transacción | Cada venta tiene al menos una línea, una salida de inventario por línea y exactamente un pago con monto igual al total. Si no, se revierte toda la venta. |

## 12. Vistas (consultas listas para la API)

| Vista | Columnas principales | Uso en la app |
|---|---|---|
| `v_venta_resumen` | venta, fecha, cajero, cliente, líneas, unidades, total, costo, ganancia, método, vuelto | Historial y detalle de venta; reporte de ventas. La ganancia es NULL si falta algún costo. |
| `v_venta_detalle` | venta, fecha, producto, cantidad, precio, costo, importe, ganancia | CSV analítico, productos más vendidos. |
| `v_producto_stock` | producto, precios, stock, stock mínimo, `por_reponer` | Pestañas Productos e Inventario; "por reponer" en Inicio. |
| `v_merma` | fecha, producto, motivo, cantidad, costo, `valor_perdido`, observación | Reporte e indicador de mermas. |
| `v_trazabilidad_producto` | movimiento, tipo, variación, saldo reconstruido, operador, venta | Detalle de inventario: "¿por qué tengo 22 unidades?". |
| `v_descuadre_inventario` | producto, saldo, saldo según el libro | **Siempre debe estar vacía.** Es la prueba de conciliación de la demo. |

## 13. Índices

| Índice | Acelera |
|---|---|
| `ix_venta_fecha` | Historial reciente y reportes por periodo. |
| `ix_venta_usuario_fecha` | Ventas por cajero. |
| `ix_venta_cliente_fecha` (parcial) | Compras de un cliente (solo ventas con cliente). |
| `ix_detalle_producto` | Ranking de productos vendidos. |
| `ix_movimiento_producto` | Historial de un producto. |
| `ix_movimiento_merma` (parcial) | Reporte de mermas por fecha. |
| `ix_exportacion_usuario` | Auditoría de exportaciones. |
| `ix_producto_nombre` | Búsqueda por nombre sin distinguir mayúsculas. |

## 14. Trazabilidad con las reglas del Plan Maestro V6

| Regla | Dónde se garantiza |
|---|---|
| RN-01 producto válido | `CHECK` de `producto` + validación de la API. |
| RN-02 venta con líneas, sin duplicados | `uq_detalle_venta_producto` + `ct_venta_completa`. |
| RN-03 stock suficiente | `ck_saldo_no_negativo` + bloqueo `FOR UPDATE` en el servicio. |
| RN-04 precio del servidor e histórico | `detalle_venta.precio_unitario` copiado por la API desde `producto`. |
| RN-05 efectivo ≥ total, vuelto no es ingreso | `ck_pago_evidencia` + `monto = total`. |
| RN-06 pago electrónico verificado, sin datos de tarjeta | `ck_pago_evidencia`, `uq_pago_referencia`, `verificado_por`. |
| RN-07 idempotencia | `clave_idempotencia` única + `solicitud_firma`. |
| RN-08 reportes por `[desde, hasta)` | `reporte_exportacion` + consultas de la API sobre las vistas. |

## 15. Datos iniciales (`02_datos_iniciales.sql`)

| Rol | Nombre | Correo | Contraseña |
|---|---|---|---|
| PROPIETARIO | Cesar Dionicio | `cadionicio@gmail.com` | `Propietario2026` |
| CAJERO | Giancarlo Aguirre | `giancarlo@uni.pe` | `Cajero2026` |

| Código | Producto | Precio | Costo | Stock | Mínimo | Propósito en la demo |
|---|---|---|---|---|---|---|
| P0001 | Coca-Cola 500 ml | 3.50 | 2.60 | 24 | 10 | Venta normal. |
| P0002 | Inca Kola 500 ml | 3.50 | 2.60 | 36 | 10 | — |
| P0003 | Galletas Soda Field 6 und. | 4.20 | 3.10 | 8 | 5 | Probar stock insuficiente (vender 9). |
| P0004 | Leche Gloria azul 400 g | 4.80 | 3.90 | 52 | 12 | Probar merma por vencimiento. |
| P0005 | Arroz Costeño 1 kg | 5.20 | 4.30 | 30 | 8 | — |
| P0006 | Azúcar rubia 1 kg | 4.50 | 3.70 | 4 | 6 | Ya aparece "por reponer". |
| P0007 | Aceite Primor 1 L | 11.90 | 9.80 | 12 | 4 | — |
| P0008 | Pan francés (unidad) | 0.30 | **NULL** | 60 | 20 | Muestra la ganancia "sin dato" y un producto sin código de barras. |
