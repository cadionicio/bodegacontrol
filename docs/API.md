# BodegaControl · Documentación de la API REST

API REST propia del Taller 3 (SI806V · Grupo 2). Los ejemplos de esta guía son respuestas reales de la API ejecutándose sobre PostgreSQL con los datos iniciales (`base-datos/02_datos_iniciales.sql`). Algunos ejemplos se recortaron con `…`.

| Recurso | Ubicación |
|---|---|
| Documentación interactiva (Swagger) | `{baseUrl}/docs` |
| Esquema OpenAPI | `{baseUrl}/openapi.json` |
| Colección Postman | [`docs/postman/BodegaControl.postman_collection.json`](postman/BodegaControl.postman_collection.json) |
| Entornos Postman | [`local`](postman/BodegaControl.local.postman_environment.json) · [`vercel`](postman/BodegaControl.vercel.postman_environment.json) |

## 1. Convenciones

**URL base:** `http://localhost:8000/api/v1` en local o `https://<proyecto>.vercel.app/api/v1` en Vercel.

**Autenticación:** JWT con el encabezado `Authorization: Bearer <token>`. El token se obtiene con `POST /auth/login` y es válido por 12 horas. El rol del usuario lo lee el servidor desde la base de datos en cada solicitud y nunca se toma de la app.

| Rol | Permisos |
|---|---|
| `PROPIETARIO` | Todas las operaciones. |
| `CAJERO` | Consultar productos, inventario y clientes; registrar clientes y ventas; ver solo su historial. No recibe costos ni ganancias. |

**Formato:** JSON en UTF-8. Los importes son números con dos decimales (soles). Las fechas siguen ISO 8601 en UTC. Los periodos de los reportes se calculan en hora de Lima con intervalos `[desde, hasta)`.

**Campos estrictos:** si el cuerpo trae campos no permitidos (por ejemplo `precio` en una venta o `stock` al editar un producto), la API responde 400. No los ignora en silencio.

**Formato de error (todas las respuestas 4xx y 5xx):**

```json
{
  "codigo": "STOCK_INSUFICIENTE",
  "mensaje": "Cantidad no disponible",
  "errores": [{ "producto_id": 5, "nombre": "Arroz Costeño 5 kg", "solicitado": 9999, "disponible": 18 }],
  "conservar_borrador": true
}
```

`conservar_borrador` indica a la app si debe mantener el carrito o el formulario para que el usuario corrija.

| Código HTTP | Significado en esta API |
|---|---|
| 200 | Consulta correcta; también un reintento de venta con la misma clave (no se duplica). |
| 201 | Recurso creado (producto, entrada, merma, cliente, venta). |
| 202 | Venta en proceso (consulta de estado). |
| 204 | Operación correcta sin cuerpo (desactivar, quitar foto). |
| 400 | Solicitud mal formada: campos faltantes, tipos o formatos inválidos, campos no permitidos. |
| 401 | Sin token, token vencido o credenciales incorrectas. |
| 403 | El rol no tiene permiso. |
| 404 | El recurso no existe. |
| 409 | Conflicto con el estado actual: stock insuficiente, duplicados, clave reutilizada. |
| 413 | Foto mayor a 500 KB. |
| 422 | Regla de negocio: producto inactivo, efectivo insuficiente, cliente no disponible, foto inválida. |
| 500 / 503 | Error interno o base de datos no disponible; la app no debe dar la operación por confirmada. |

## 2. Resumen de endpoints

| # | Método | Ruta | Rol | Descripción |
|---|---|---|---|---|
| 1 | GET | `/salud` | Público | Estado de la API y de PostgreSQL |
| 2 | POST | `/auth/login` | Público | Iniciar sesión |
| 3 | GET | `/auth/sesion` | Ambos | Usuario actual |
| 4 | GET | `/productos` | Ambos | Listar y buscar |
| 5 | POST | `/productos` | Propietario | Crear con stock inicial |
| 6 | GET | `/productos/{producto_id}` | Ambos | Detalle |
| 7 | GET | `/productos/codigo-barras/{codigo_barras}` | Ambos | Producto escaneado |
| 8 | PATCH | `/productos/{producto_id}` | Propietario | Editar (no el stock) |
| 9 | DELETE | `/productos/{producto_id}` | Propietario | Desactivar (baja lógica) |
| 10 | PUT | `/productos/{producto_id}/imagen` | Propietario | Subir o reemplazar foto |
| 11 | GET | `/productos/{producto_id}/imagen` | Público | Ver foto |
| 12 | DELETE | `/productos/{producto_id}/imagen` | Propietario | Quitar foto |
| 13 | GET | `/inventario/{producto_id}` | Ambos | Saldo y últimos movimientos |
| 14 | POST | `/inventario/{producto_id}/entradas` | Propietario | Reposición |
| 15 | POST | `/inventario/{producto_id}/mermas` | Propietario | Merma |
| 16 | GET | `/clientes` | Ambos | Buscar clientes |
| 17 | POST | `/clientes` | Ambos | Registrar cliente |
| 18 | POST | `/ventas` | Ambos | Confirmar venta (transaccional e idempotente) |
| 19 | GET | `/ventas/estado` | Ambos | Estado por clave de idempotencia |
| 20 | GET | `/ventas` | Ambos | Historial |
| 21 | GET | `/ventas/{venta_id}` | Ambos | Detalle de venta |
| 22 | GET | `/reportes/resumen` | Propietario | Indicadores del periodo |
| 23 | GET | `/reportes/{tipo}` | Propietario | Reporte de ventas o mermas (JSON, PDF, CSV) |
| 24 | GET | `/reportes/exportaciones` | Propietario | Últimas exportaciones |

## 3. Autenticación

### POST `/auth/login`

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `correo` | texto | Sí | Hasta 160 caracteres |
| `contrasena` | texto | Sí | Hasta 128 caracteres |

```json
{ "correo": "giancarlo@uni.pe", "contrasena": "Cajero2026" }
```

**200**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "tipo": "Bearer",
  "expira_en": "2026-11-03T14:44:39.477769+00:00",
  "usuario": { "usuario_id": 2, "nombre": "Giancarlo Aguirre", "correo": "giancarlo@uni.pe", "rol": "CAJERO" }
}
```

**401** `CREDENCIALES_INVALIDAS`: «Correo o contraseña incorrectos». El mensaje es el mismo si el correo no existe, para no revelar qué cuentas hay.

### GET `/auth/sesion`

**200**

```json
{ "usuario_id": 1, "nombre": "Cesar Dionicio", "correo": "cadionicio@gmail.com", "rol": "PROPIETARIO" }
```

**401** `NO_AUTENTICADO`, `SESION_EXPIRADA`, `TOKEN_INVALIDO` o `USUARIO_INACTIVO`.

## 4. Productos

### GET `/productos`

| Parámetro (query) | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `buscar` | texto | — | Coincidencia por nombre, código o código de barras |
| `por_reponer` | booleano | `false` | Solo productos con stock ≤ stock mínimo |
| `incluir_inactivos` | booleano | `false` | Incluye productos desactivados |

**200**: lista ordenada. El cajero no recibe el campo `costo`.

```json
[
  {
    "producto_id": 4, "codigo": "P0004", "codigo_barras": null, "nombre": "Leche Gloria 1 L",
    "precio": 4.8, "costo": 3.9, "stock_minimo": 12, "activo": true, "stock": 52,
    "stock_actualizado_en": "2026-11-03T02:42:06.898053+00:00", "por_reponer": false,
    "actualizado_en": "2026-11-03T02:42:06.898053+00:00", "imagen_version": null
  }
]
```

### POST `/productos`

El código interno (`P0001`, `P0002`…) lo asigna la base de datos. Si el stock inicial es mayor que 0, se registra un movimiento `ALTA`.

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `nombre` | texto | Sí | 1 a 120 caracteres |
| `precio` | decimal | Sí | > 0, dos decimales |
| `costo` | decimal | No | ≥ 0; si falta, la ganancia de ese producto se reporta como desconocida |
| `stock_minimo` | entero | No | 0 a 100 000 (por defecto 0) |
| `stock_inicial` | entero | No | 0 a 100 000 (por defecto 0) |
| `codigo_barras` | texto | No | 4 a 64 caracteres `A-Z a-z 0-9 . _ -`, único |

```json
{ "nombre": "Chicle Trident", "precio": 1.50, "costo": 0.90, "stock_minimo": 5, "stock_inicial": 20, "codigo_barras": "7753673879924" }
```

**201**

```json
{
  "producto_id": 16, "codigo": "P0011", "codigo_barras": "7753673879924", "nombre": "Chicle Trident",
  "precio": 1.5, "costo": 0.9, "stock_minimo": 5, "activo": true, "stock": 20,
  "stock_actualizado_en": "2026-11-03T02:44:39.941081+00:00", "por_reponer": false,
  "actualizado_en": "2026-11-03T02:44:39.941081+00:00", "imagen_version": null
}
```

**400** `SOLICITUD_INVALIDA`

```json
{
  "codigo": "SOLICITUD_INVALIDA", "mensaje": "Revise los campos indicados",
  "errores": [
    { "campo": "nombre", "detalle": "String should have at least 1 character" },
    { "campo": "precio", "detalle": "Input should be greater than 0" }
  ],
  "conservar_borrador": true
}
```

**409** `CODIGO_BARRAS_DUPLICADO` · **403** `SIN_PERMISO` (cajero).

### GET `/productos/{producto_id}`

**200**: el mismo objeto que en la creación. **404** `NO_ENCONTRADO`: «El producto no existe».

### GET `/productos/codigo-barras/{codigo_barras}`

Lo usa el escáner de la app. **200**: el producto activo con ese código. **404** `NO_ENCONTRADO`: «No hay un producto activo con ese código de barras». Ante el 404, la app conserva el carrito y ofrece la búsqueda manual.

### PATCH `/productos/{producto_id}`

Acepta cualquier subconjunto de `nombre`, `precio`, `costo`, `stock_minimo`, `codigo_barras` y `activo`. El `codigo` y el `stock` no se editan: el stock solo cambia mediante movimientos.

```json
{ "precio": 1.80, "stock_minimo": 8 }
```

**200**: el producto actualizado. **400**: cuerpo vacío, campo no permitido o `null` en un campo obligatorio.

```json
{ "codigo": "SOLICITUD_INVALIDA", "mensaje": "Revise los campos indicados",
  "errores": [{ "campo": "stock", "detalle": "Extra inputs are not permitted" }], "conservar_borrador": true }
```

**404** · **409** `CODIGO_BARRAS_DUPLICADO`.

### DELETE `/productos/{producto_id}`

Baja lógica (`activo = false`). Las ventas y los movimientos anteriores se conservan. **204** sin cuerpo · **404**.

### PUT `/productos/{producto_id}/imagen`

El cuerpo es el binario de la foto, con `Content-Type: image/jpeg`, `image/png` o `image/webp`. La API comprueba la firma real del archivo, no solo la cabecera. Si ya había una foto, la reemplaza.

**200**: el producto con `imagen_version` actualizado · **413** `IMAGEN_MUY_GRANDE` (más de 500 KB) · **422** `IMAGEN_INVALIDA`.

### GET `/productos/{producto_id}/imagen`

Es pública porque una etiqueta `<img>` no envía el token. **200** con la imagen y caché por versión · **404** si no tiene foto.

### DELETE `/productos/{producto_id}/imagen`

**204**.

## 5. Inventario

### GET `/inventario/{producto_id}`

**200**: el saldo y los últimos movimientos, con el saldo reconstruido en cada movimiento.

```json
{
  "producto": { "producto_id": 4, "codigo": "P0004", "nombre": "Leche Gloria 1 L", "stock": 52, "stock_minimo": 12, "…": "…" },
  "movimientos": [
    { "movimiento_id": 4, "registrada_en": "2026-11-03T02:42:06.898053+00:00", "tipo": "ALTA", "motivo_merma": null,
      "cantidad": 52, "variacion": 52, "saldo_reconstruido": 52, "operador": "Cesar Dionicio",
      "venta_id": null, "numero_entrada": null, "tipo_comprobante": null }
  ]
}
```

### POST `/inventario/{producto_id}/entradas`

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `cantidad` | entero | Sí | 1 a 100 000 |
| `tipo_comprobante` | texto | Sí | `BOLETA`, `FACTURA`, `GUIA` o `SIN_COMPROBANTE` |
| `numero_comprobante` | texto | No | Número del documento del proveedor; no se envía con `SIN_COMPROBANTE` |

```json
{ "cantidad": 12, "tipo_comprobante": "FACTURA", "numero_comprobante": "F001-245" }
```

**201**: la base de datos asigna el número de entrada correlativo.

```json
{
  "movimiento": { "movimiento_id": 40, "tipo": "ENTRADA", "cantidad": 12, "registrada_en": "2026-11-03T02:44:40.310171+00:00",
                  "numero_entrada": "E-00006", "tipo_comprobante": "FACTURA" },
  "producto": { "producto_id": 4, "nombre": "Leche Gloria 1 L", "stock": 64, "…": "…" },
  "movimientos": ["…"]
}
```

**400**: «Sin comprobante no debe enviarse número de comprobante» · **422** `PRODUCTO_INACTIVO` · **403** · **404**.

### POST `/inventario/{producto_id}/mermas`

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `cantidad` | entero | Sí | 1 a 100 000, sin superar el stock |
| `motivo` | texto | Sí | `VENCIDO`, `DANADO`, `FALTANTE` u `OTRO` |
| `observacion` | texto | Con `OTRO` | Hasta 120 caracteres |

```json
{ "cantidad": 1, "motivo": "VENCIDO" }
```

**201**: la misma estructura que la entrada, con `tipo: "MERMA"`. El costo unitario queda congelado en el movimiento para calcular la pérdida.

**409** `STOCK_INSUFICIENTE`

```json
{ "codigo": "STOCK_INSUFICIENTE", "mensaje": "La merma supera el stock disponible",
  "errores": [{ "producto_id": 4, "solicitado": 99999, "disponible": 63 }], "conservar_borrador": true }
```

## 6. Clientes

### GET `/clientes?buscar=quispe`

`buscar` (nombre o documento) y `limite` (1 a 100, por defecto 20). **200**: lista de clientes activos que coinciden.

### POST `/clientes`

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `tipo_documento` | texto | No | `NINGUNO` (por defecto), `DNI`, `RUC` o `CE` |
| `numero_documento` | texto | Según tipo | DNI de 8 dígitos; RUC de 11 dígitos que empieza en 10, 15, 17 o 20; CE de 4 a 24 caracteres |
| `nombre` | texto | Sí | 1 a 140 caracteres |
| `telefono` | texto | No | 6 a 14 dígitos, `+` opcional |

```json
{ "tipo_documento": "DNI", "numero_documento": "59047142", "nombre": "María Quispe", "telefono": "987654321" }
```

**201**

```json
{ "cliente_id": 5, "tipo_documento": "DNI", "numero_documento": "59047142", "nombre": "María Quispe", "telefono": "987654321", "activo": true }
```

**400**: «Número de DNI inválido» · **409** `CLIENTE_DUPLICADO`.

## 7. Ventas (operación de negocio)

### POST `/ventas`

Confirma la venta completa en una sola transacción:

1. Valida al usuario, los productos activos y las cantidades.
2. Toma los precios del catálogo; la app no los envía.
3. Bloquea los saldos en orden para evitar que dos ventas se crucen.
4. Comprueba el stock y el pago.
5. Registra la venta, el detalle, el pago y un movimiento `SALIDA_VENTA` por línea.

Si algo falla, no se guarda nada.

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `clave_idempotencia` | UUID | Sí | La genera la app una vez por venta; se reutiliza en los reintentos |
| `cliente_id` | entero | No | Cliente activo |
| `lineas[]` | lista | Sí | 1 a 50 líneas, sin productos repetidos |
| `lineas[].producto_id` | entero | Sí | > 0 |
| `lineas[].cantidad` | entero | Sí | 1 a 10 000 |
| `pago.metodo` | texto | Sí | `EFECTIVO`, `YAPE`, `PLIN` o `TARJETA` |
| `pago.importe_recibido` | decimal | Solo efectivo | ≥ total; con él se calcula el vuelto |
| `pago.referencia_externa` | texto | Yape, Plin, tarjeta | N.º de operación verificado (4 a 80 caracteres), único |
| `pago.modalidad_tarjeta` | texto | Solo tarjeta | `DEBITO` o `CREDITO` |

```json
{
  "clave_idempotencia": "8e710ad8-92b2-4216-a290-bdcbda178fb4",
  "cliente_id": 5,
  "lineas": [{ "producto_id": 1, "cantidad": 2 }, { "producto_id": 4, "cantidad": 1 }],
  "pago": { "metodo": "EFECTIVO", "importe_recibido": 20.00 }
}
```

**201** si la venta es nueva; **200** si es un reintento con la misma clave y el mismo contenido (`"repetida": true`, sin duplicar).

```json
{
  "estado": "CONFIRMADA", "repetida": false, "venta_id": 20, "registrada_en": "2026-11-03T02:44:40.541402+00:00",
  "usuario_id": 2, "cajero": "Giancarlo Aguirre", "cliente_id": 5, "cliente": "María Quispe",
  "clave_idempotencia": "8e710ad8-92b2-4216-a290-bdcbda178fb4", "lineas": 2, "unidades": 3, "total": 11.8,
  "metodo": "EFECTIVO", "modalidad_tarjeta": null, "importe_recibido": 20.0, "vuelto": 8.2, "referencia_externa": null,
  "detalle": [
    { "producto_id": 1, "codigo": "P0001", "nombre": "Coca-Cola 500 ml", "cantidad": 2, "precio_unitario": 3.5, "importe": 7.0, "movimiento_id": 42 },
    { "producto_id": 4, "codigo": "P0004", "nombre": "Leche Gloria 1 L", "cantidad": 1, "precio_unitario": 4.8, "importe": 4.8, "movimiento_id": 43 }
  ]
}
```

Pago con Yape:

```json
{ "clave_idempotencia": "b2307346-d783-461e-8e21-6f42dde89914",
  "lineas": [{ "producto_id": 7, "cantidad": 1 }],
  "pago": { "metodo": "YAPE", "referencia_externa": "YP1793673880630" } }
```

| Código | `codigo` | Cuándo |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA` | Falta la evidencia del pago, hay productos repetidos o se envían campos no permitidos (`precio`, `total`) |
| 409 | `STOCK_INSUFICIENTE` | Alguna línea supera el stock; `errores` lista cada línea con lo solicitado y lo disponible |
| 409 | `CLAVE_REUTILIZADA` | La misma clave se usó con otro contenido |
| 409 | `REFERENCIA_PAGO_DUPLICADA` | Ese N.º de operación ya pagó otra venta |
| 422 | `PRODUCTO_NO_DISPONIBLE` | Producto inexistente o desactivado |
| 422 | `EFECTIVO_INSUFICIENTE` | El importe recibido no cubre el total |
| 422 | `CLIENTE_NO_DISPONIBLE` | Cliente inexistente o inactivo |

```json
{ "codigo": "EFECTIVO_INSUFICIENTE", "mensaje": "El importe recibido no cubre el total",
  "errores": [{ "campo": "pago.importe_recibido", "total": 24.9, "recibido": 1.0 }], "conservar_borrador": true }
```

### GET `/ventas/estado?clave={uuid}`

La app lo consulta tras un corte de red o un timeout, antes de reintentar. **200**: la venta ya está confirmada (el mismo cuerpo que arriba). **202**: la venta está en proceso. **404** `VENTA_NO_REGISTRADA`: se puede reenviar con la misma clave.

### GET `/ventas`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `desde`, `hasta` | fecha `AAAA-MM-DD` | Rango opcional en hora de Lima |
| `limite` | entero | 1 a 100, por defecto 30. La app pide las últimas 40 |
| `antes_de` | entero | Cursor de paginación: último `venta_id` recibido |

**200**: lista de ventas, de la más reciente a la más antigua. El cajero solo ve las suyas y sin `costo_total` ni `ganancia`.

### GET `/ventas/{venta_id}`

**200**: la venta con `detalle` y el `movimiento_id` de cada línea. Para el propietario incluye `costo_total` y `ganancia`, que valen `null` si alguna línea no tiene costo. **404**.

## 8. Reportes (solo propietario)

### Parámetros comunes

| Parámetro | Valores | Descripción |
|---|---|---|
| `periodo` | `DIARIO`, `SEMANAL`, `MENSUAL`, `BIMESTRAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`, `TODO`, `PERSONALIZADO` | Por defecto `MENSUAL` (`DIARIO` en el resumen) |
| `fecha` | `AAAA-MM-DD` | Cualquier día del periodo; por defecto, hoy |
| `desde`, `hasta` | `AAAA-MM-DD` | Obligatorios con `PERSONALIZADO`, con `desde ≤ hasta` |

### GET `/reportes/resumen`

**200**: indicadores del tablero de Inicio.

```json
{
  "intervalo": { "periodo": "DIARIO", "desde": "2026-11-02T00:00:00-05:00", "hasta_exclusivo": "2026-11-03T00:00:00-05:00", "etiqueta": "02/11/2026 al 02/11/2026" },
  "ventas": { "ventas": 2, "total": 23.7, "unidades": 4, "ticket_promedio": 11.85, "ganancia_conocida": 4.8, "ventas_sin_costo": 0 },
  "por_metodo": [{ "metodo": "YAPE", "ventas": 1, "total": 11.9 }, { "metodo": "EFECTIVO", "ventas": 1, "total": 11.8 }],
  "mas_vendidos": [{ "producto_id": 1, "codigo": "P0001", "nombre": "Coca-Cola 500 ml", "unidades": 2, "total": 7.0 }, "…"],
  "…": "mermas, catálogo y serie de los últimos 7 días"
}
```

### GET `/reportes/{tipo}`

`tipo` es `ventas` o `mermas`. Con `formato`: `JSON` (vista previa, por defecto), `PDF` o `CSV` (UTF-8 con BOM para Excel). Los archivos se descargan con `Content-Disposition` y cada PDF o CSV queda registrado en la auditoría.

**200**: con `formato=JSON`

```json
{
  "intervalo": { "periodo": "MENSUAL", "desde": "2026-11-01T00:00:00-05:00", "hasta_exclusivo": "2026-12-01T00:00:00-05:00", "etiqueta": "01/11/2026 al 30/11/2026" },
  "resumen": { "ventas": 2, "total": 23.7, "unidades": 4, "ticket_promedio": 11.85, "ganancia_conocida": 4.8, "ventas_sin_costo": 0 },
  "filas": [{ "venta_id": 20, "registrada_en": "2026-11-03T02:44:40.541402+00:00", "cajero": "Giancarlo Aguirre", "cliente": "María Quispe",
              "metodo": "EFECTIVO", "lineas": 2, "unidades": 3, "total": 11.8, "costo_total": 9.1, "ganancia": 2.7 }, "…"]
}
```

**400** `FECHAS_INVALIDAS` · **403** `SIN_PERMISO` (cajero).

### GET `/reportes/exportaciones?limite=5`

**200**: los últimos PDF y CSV generados.

```json
[{ "exportacion_id": 1, "tipo_reporte": "VENTAS", "formato": "PDF", "periodo": "MENSUAL",
   "desde": "2026-11-01T05:00:00+00:00", "hasta_exclusivo": "2026-12-01T05:00:00+00:00",
   "cantidad_filas": 2, "generado_en": "2026-11-03T02:44:40.947288+00:00", "generado_por": "Cesar Dionicio" }]
```

## 9. Salud

### GET `/salud`

```json
{ "estado": "OK", "version_api": "1.0.0", "hora_servidor": "2026-11-03T02:44:38.855917+00:00", "postgres": "16.15" }
```

**503** si la base de datos no responde.

## 10. Probar con Postman

1. Importar en Postman la colección y los dos entornos de `docs/postman/`.
2. Elegir el entorno **BodegaControl · Local** (con la API en `http://localhost:8000`) o **BodegaControl · Vercel**.
3. Ejecutar la colección completa con *Run collection*. Los logins guardan los tokens y cada solicitud verifica su código HTTP.

Desde la terminal, con [Newman](https://www.npmjs.com/package/newman):

```bash
cd docs/postman
npx newman run BodegaControl.postman_collection.json -e BodegaControl.local.postman_environment.json --working-dir .
```

Resultado sobre la base con los datos iniciales: 49 solicitudes y 68 verificaciones, sin fallos. La colección se puede repetir porque genera códigos de barras, DNI y números de operación únicos en cada ejecución.
