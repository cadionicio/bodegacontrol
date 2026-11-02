"""Pruebas de integridad del esquema BodegaControl V6 directamente contra PostgreSQL.

Verifica que la base rechace datos inválidos aunque el backend tuviera errores.
Uso:  DATABASE_URL=postgresql://usuario:clave@host/bd  python 03_pruebas_esquema.py
Cada caso se ejecuta en su propia transacción y se revierte: la base queda intacta.
"""
import os
import uuid
from decimal import Decimal as D

import psycopg

URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost/bodega")
resultados: list[bool] = []


def consultar(cx, sql, *parametros):
    return cx.execute(sql, parametros or None).fetchall()


def ejecutar_caso(nombre: str, operacion, debe_fallar: bool, confirmar: bool = True):
    """Corre la operación; los triggers diferidos solo se evalúan al COMMIT, por eso se confirma."""
    with psycopg.connect(URL) as cx:
        try:
            detalle = operacion(cx)
            if confirmar:
                cx.execute("SET CONSTRAINTS ALL IMMEDIATE")  # fuerza la validación diferida sin persistir
            exito, mensaje = not debe_fallar, f"aceptado {detalle or ''}"
        except psycopg.Error as error:
            restriccion = error.diag.constraint_name or error.diag.message_primary
            exito, mensaje = debe_fallar, f"rechazado [{error.diag.sqlstate}] {restriccion}"
        except AssertionError as error:
            exito, mensaje = False, f"resultado inesperado {error}"
        finally:
            cx.rollback()
    resultados.append(exito)
    print(f"{'✓' if exito else '✗'} {nombre}: {mensaje}")


def id_usuario(cx, correo):
    return consultar(cx, "SELECT usuario_id FROM bc.usuario WHERE correo = %s", correo)[0][0]


def id_producto(cx, codigo):
    return consultar(cx, "SELECT producto_id FROM bc.producto WHERE codigo = %s", codigo)[0][0]


def registrar_venta(cx, lineas, metodo="EFECTIVO", recibido=100, referencia=None, modalidad=None,
                    monto=None, con_salidas=True, con_pago=True):
    """Replica el orden de la capa de servicios: cabecera → detalle → salida → pago."""
    cajero = id_usuario(cx, "giancarlo@uni.pe")
    venta = consultar(cx, "INSERT INTO bc.venta (usuario_id, clave_idempotencia, solicitud_firma) "
                          "VALUES (%s, %s, %s) RETURNING venta_id", cajero, uuid.uuid4(), "a" * 64)[0][0]
    total = 0
    for codigo, cantidad in lineas:
        detalle, producto, precio = consultar(cx, """
            INSERT INTO bc.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, costo_unitario)
            SELECT %s, producto_id, %s, precio, costo FROM bc.producto WHERE codigo = %s
            RETURNING detalle_id, producto_id, precio_unitario""", venta, cantidad, codigo)[0]
        total += precio * cantidad
        if con_salidas:
            cx.execute("INSERT INTO bc.movimiento_inventario (producto_id, usuario_id, detalle_id, tipo, cantidad) "
                       "VALUES (%s, %s, %s, 'SALIDA_VENTA', %s)", (producto, cajero, detalle, cantidad))
    if con_pago:
        cx.execute("""INSERT INTO bc.venta_pago (venta_id, metodo, modalidad_tarjeta, total_cobrado, importe_recibido,
                      referencia_externa, verificado_por) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                   (venta, metodo, modalidad, monto or total, recibido if metodo == "EFECTIVO" else None,
                    referencia, cajero))
    return venta


def registrar_movimiento(cx, codigo, tipo, cantidad, referencia=None, motivo=None, costo=None, comprobante=None):
    return cx.execute("""INSERT INTO bc.movimiento_inventario
                  (producto_id, usuario_id, tipo, cantidad, referencia, motivo_merma, costo_unitario, tipo_comprobante)
                  VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING numero_entrada""",
               (id_producto(cx, codigo), id_usuario(cx, "cadionicio@gmail.com"), tipo, cantidad,
                referencia, motivo, costo, comprobante)).fetchone()[0]


def stock(cx, codigo):
    return consultar(cx, "SELECT stock FROM bc.v_producto_stock WHERE codigo = %s", codigo)[0][0]


def venta_valida(cx):
    venta = registrar_venta(cx, [("P0001", 2), ("P0003", 1)], recibido=20)
    fila = consultar(cx, "SELECT total, ganancia, vuelto FROM bc.v_venta_resumen WHERE venta_id = %s", venta)[0]
    assert stock(cx, "P0001") == 46 and fila == (D('11.20'), D('2.90'), D('8.80')), fila
    return f"total={fila[0]} ganancia={fila[1]} vuelto={fila[2]} stock P0001=46"


def venta_sin_costo(cx):
    venta = registrar_venta(cx, [("P0008", 10), ("P0001", 1)], recibido=10)
    ganancia = consultar(cx, "SELECT ganancia FROM bc.v_venta_resumen WHERE venta_id = %s", venta)[0][0]
    assert ganancia is None
    return "ganancia=NULL (sin dato)"


def merma_valida(cx):
    registrar_movimiento(cx, "P0004", "MERMA", 3, motivo="VENCIDO", costo=3.90)
    valor = consultar(cx, "SELECT valor_perdido FROM bc.v_merma")[0][0]
    assert stock(cx, "P0004") == 49 and valor == D('11.70')
    return f"stock P0004=49 valor_perdido={valor}"


def producto_nuevo_con_saldo(cx):
    cx.execute("INSERT INTO bc.producto (codigo, nombre, precio) VALUES ('P0100', 'Chicle', 0.50)")
    assert stock(cx, "P0100") == 0
    return "saldo creado en 0 automáticamente"


def codigo_automatico(cx):
    codigos = [consultar(cx, "INSERT INTO bc.producto (nombre, precio) VALUES (%s, 1) RETURNING codigo", n)[0][0]
               for n in ("Chicle", "Caramelo")]
    assert codigos == ["P0009", "P0010"], codigos
    return f"códigos asignados {codigos}"


def actualizado_en_automatico(cx):
    antes = consultar(cx, "SELECT actualizado_en FROM bc.producto WHERE codigo = 'P0001'")[0][0]
    cx.execute("SELECT pg_sleep(0.01)")
    cx.commit()  # NOW() es fijo dentro de una transacción; se separa para observar el cambio
    cx.execute("UPDATE bc.producto SET precio = precio WHERE codigo = 'P0001'")
    despues = consultar(cx, "SELECT actualizado_en FROM bc.producto WHERE codigo = 'P0001'")[0][0]
    assert despues > antes
    return "actualizado_en avanzó"


CASOS_VALIDOS = [
    ("Venta en efectivo completa", venta_valida),
    ("Venta Yape con referencia", lambda cx: registrar_venta(cx, [("P0002", 1)], "YAPE", referencia="YP-000123")),
    ("Venta tarjeta débito", lambda cx: registrar_venta(cx, [("P0002", 1)], "TARJETA", referencia="POS-998877",
                                                       modalidad="DEBITO")),
    ("Ganancia sin dato si falta costo", venta_sin_costo),
    ("Merma valorizada al costo", merma_valida),
    ("Reposición con N.º de entrada automático", lambda cx: [registrar_movimiento(cx, "P0006", "ENTRADA", 10, "F001-123", comprobante="FACTURA"),
                                                             registrar_movimiento(cx, "P0006", "ENTRADA", 5, comprobante="SIN_COMPROBANTE")]),
    ("Producto nuevo nace con saldo", producto_nuevo_con_saldo),
    ("actualizado_en por trigger", actualizado_en_automatico),
    ("Código de producto correlativo", codigo_automatico),
]

CASOS_INVALIDOS = [
    # Inventario
    ("Venta con stock insuficiente", lambda cx: registrar_venta(cx, [("P0006", 5)])),
    ("Merma mayor al stock", lambda cx: registrar_movimiento(cx, "P0006", "MERMA", 9, motivo="DANADO")),
    ("UPDATE directo del saldo", lambda cx: cx.execute("UPDATE bc.inventario_saldo SET cantidad = 999")),
    ("DELETE directo del saldo", lambda cx: cx.execute("DELETE FROM bc.inventario_saldo")),
    ("Reposición sin tipo de comprobante", lambda cx: registrar_movimiento(cx, "P0001", "ENTRADA", 5, "F001-1")),
    ("Reposición «sin comprobante» con número", lambda cx: registrar_movimiento(cx, "P0001", "ENTRADA", 5, "F001-1", comprobante="SIN_COMPROBANTE")),
    ("Tipo de comprobante en una merma", lambda cx: registrar_movimiento(cx, "P0001", "MERMA", 1, motivo="DANADO", comprobante="BOLETA")),
    ("Merma sin motivo", lambda cx: registrar_movimiento(cx, "P0001", "MERMA", 1)),
    ("Merma OTRO sin observación", lambda cx: registrar_movimiento(cx, "P0001", "MERMA", 1, motivo="OTRO")),
    ("Costo en movimiento no merma", lambda cx: registrar_movimiento(cx, "P0001", "ENTRADA", 1, "F-1", costo=1, comprobante="FACTURA")),
    ("Segundo ALTA del producto", lambda cx: registrar_movimiento(cx, "P0001", "ALTA", 1)),
    # Venta completa al COMMIT
    ("Venta sin pago", lambda cx: registrar_venta(cx, [("P0001", 1)], con_pago=False)),
    ("Venta sin líneas (solo cabecera)", lambda cx: registrar_venta(cx, [], con_pago=False)),
    ("Venta sin salida de inventario", lambda cx: registrar_venta(cx, [("P0001", 1)], con_salidas=False)),
    ("Pago distinto al total", lambda cx: registrar_venta(cx, [("P0001", 1)], monto=1.00)),
    # Pagos
    ("Efectivo insuficiente", lambda cx: registrar_venta(cx, [("P0001", 2)], recibido=5)),
    ("Efectivo sin importe recibido", lambda cx: registrar_venta(cx, [("P0001", 1)], recibido=None)),
    ("Yape sin referencia", lambda cx: registrar_venta(cx, [("P0001", 1)], "YAPE")),
    ("Tarjeta sin modalidad", lambda cx: registrar_venta(cx, [("P0001", 1)], "TARJETA", referencia="POS-1")),
    ("Plin con modalidad de tarjeta", lambda cx: registrar_venta(cx, [("P0001", 1)], "PLIN", referencia="PL-1234",
                                                                modalidad="DEBITO")),
    ("Referencia Yape reutilizada", lambda cx: [registrar_venta(cx, [("P0001", 1)], "YAPE", referencia="YP-777")
                                                for _ in range(2)]),
    # Inmutabilidad
    ("Editar venta", lambda cx: (registrar_venta(cx, [("P0001", 1)]), cx.execute("UPDATE bc.venta SET cliente_id = NULL"))),
    ("Borrar detalle", lambda cx: (registrar_venta(cx, [("P0001", 1)]), cx.execute("DELETE FROM bc.detalle_venta"))),
    ("Editar pago", lambda cx: (registrar_venta(cx, [("P0001", 1)]), cx.execute("UPDATE bc.venta_pago SET total_cobrado = 1"))),
    ("Borrar movimiento", lambda cx: cx.execute("DELETE FROM bc.movimiento_inventario")),
    # Catálogo, clientes y usuarios
    ("Código de producto inválido", lambda cx: cx.execute("INSERT INTO bc.producto (codigo, nombre, precio) VALUES ('a b', 'X', 1)")),
    ("Código de producto duplicado", lambda cx: cx.execute("INSERT INTO bc.producto (codigo, nombre, precio) VALUES ('P0001', 'X', 1)")),
    ("Precio cero", lambda cx: cx.execute("INSERT INTO bc.producto (codigo, nombre, precio) VALUES ('P0099', 'X', 0)")),
    ("Costo negativo", lambda cx: cx.execute("INSERT INTO bc.producto (codigo, nombre, precio, costo) VALUES ('P0099', 'X', 1, -1)")),
    ("Borrar producto con historia", lambda cx: cx.execute("DELETE FROM bc.producto WHERE codigo = 'P0001'")),
    ("DNI de 7 dígitos", lambda cx: cx.execute("INSERT INTO bc.cliente (tipo_documento, numero_documento, nombre) VALUES ('DNI', '1234567', 'Ana')")),
    ("DNI sin número", lambda cx: cx.execute("INSERT INTO bc.cliente (tipo_documento, nombre) VALUES ('DNI', 'Ana')")),
    ("DNI duplicado", lambda cx: cx.execute("INSERT INTO bc.cliente (tipo_documento, numero_documento, nombre) "
                                           "VALUES ('DNI', '12345678', 'Ana'), ('DNI', '12345678', 'Eva')")),
    ("Contraseña sin hash bcrypt", lambda cx: cx.execute("INSERT INTO bc.usuario (rol_id, nombre, correo, contrasena_hash) VALUES (1, 'X', 'x@y.pe', 'clave')")),
    ("Imagen de producto vacía", lambda cx: cx.execute("INSERT INTO bc.producto_imagen VALUES (1, 'image/jpeg', '\\x00')")),
    ("Imagen con formato no permitido", lambda cx: cx.execute("INSERT INTO bc.producto_imagen VALUES (1, 'image/gif', decode(repeat('ff', 200), 'hex'))")),
    ("Correo con mayúsculas", lambda cx: cx.execute("INSERT INTO bc.usuario (rol_id, nombre, correo, contrasena_hash) VALUES (1, 'X', 'X@Y.pe', '$2b$x')")),
]

if __name__ == "__main__":
    print("── Casos válidos (deben aceptarse) ──")
    for nombre, operacion in CASOS_VALIDOS:
        ejecutar_caso(nombre, operacion, debe_fallar=False)
    print("── Casos inválidos (deben rechazarse) ──")
    for nombre, operacion in CASOS_INVALIDOS:
        ejecutar_caso(nombre, operacion, debe_fallar=True)
    with psycopg.connect(URL) as cx:
        descuadres = consultar(cx, "SELECT COUNT(*) FROM bc.v_descuadre_inventario")[0][0]
    resultados.append(descuadres == 0)
    print(f"{'✓' if descuadres == 0 else '✗'} Conciliación saldo = libro de movimientos: {descuadres} descuadres")
    print(f"\nResultado: {sum(resultados)}/{len(resultados)} casos correctos")
    raise SystemExit(0 if all(resultados) else 1)
