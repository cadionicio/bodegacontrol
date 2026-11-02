"""SQL de ventas: cabecera, detalle, pago y consultas de historial."""
from datetime import datetime
from uuid import UUID

from psycopg import Connection

_RESUMEN = """SELECT venta_id, registrada_en, usuario_id, cajero, cliente_id, cliente, clave_idempotencia,
                     lineas, unidades, total, costo_total, ganancia, metodo, modalidad_tarjeta,
                     importe_recibido, vuelto, referencia_externa
              FROM bc.v_venta_resumen"""


def bloquear_clave(cx: Connection, clave: UUID) -> None:
    """Serializa reintentos simultáneos de la misma clave hasta que termine la transacción original."""
    cx.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(clave),))


def clave_en_proceso(cx: Connection, clave: UUID) -> bool:
    """Si otra transacción retiene el candado de la clave, la venta se está registrando ahora mismo."""
    libre = cx.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS libre", (str(clave),)).fetchone()["libre"]
    if libre:
        cx.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (str(clave),))
    return not libre


def buscar_por_clave(cx: Connection, clave: UUID) -> dict | None:
    return cx.execute("SELECT venta_id, usuario_id, solicitud_firma FROM bc.venta WHERE clave_idempotencia = %s",
                      (clave,)).fetchone()


def insertar_venta(cx: Connection, usuario_id: int, cliente_id: int | None, clave: UUID, firma: str) -> int:
    return cx.execute("""INSERT INTO bc.venta (usuario_id, cliente_id, clave_idempotencia, solicitud_firma)
                         VALUES (%s, %s, %s, %s) RETURNING venta_id""",
                      (usuario_id, cliente_id, clave, firma)).fetchone()["venta_id"]


def insertar_detalle(cx: Connection, venta_id: int, producto: dict, cantidad: int) -> int:
    # Precio y costo se copian del catálogo bloqueado: es la fotografía histórica (RN-04).
    return cx.execute("""INSERT INTO bc.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, costo_unitario)
                         VALUES (%s, %s, %s, %s, %s) RETURNING detalle_id""",
                      (venta_id, producto["producto_id"], cantidad, producto["precio"], producto["costo"])
                      ).fetchone()["detalle_id"]


def insertar_pago(cx: Connection, venta_id: int, pago: dict, monto, usuario_id: int) -> None:
    cx.execute("""INSERT INTO bc.venta_pago (venta_id, metodo, modalidad_tarjeta, monto, importe_recibido,
                                             referencia_externa, verificado_por)
                  VALUES (%s, %s, %s, %s, %s, %s, %s)""",
               (venta_id, pago["metodo"], pago["modalidad_tarjeta"], monto, pago["importe_recibido"],
                pago["referencia_externa"], usuario_id))


def resumen(cx: Connection, venta_id: int) -> dict | None:
    return cx.execute(f"{_RESUMEN} WHERE venta_id = %s", (venta_id,)).fetchone()


def lineas(cx: Connection, venta_id: int) -> list[dict]:
    return cx.execute("""
        SELECT d.producto_id, d.codigo, d.producto_actual AS nombre, d.cantidad, d.precio_unitario,
               d.importe, d.ganancia, m.movimiento_id
        FROM bc.v_venta_detalle d
        JOIN bc.detalle_venta dv ON dv.venta_id = d.venta_id AND dv.producto_id = d.producto_id
        LEFT JOIN bc.movimiento_inventario m ON m.detalle_id = dv.detalle_id
        WHERE d.venta_id = %s ORDER BY d.codigo""", (venta_id,)).fetchall()


def listar(cx: Connection, desde: datetime | None, hasta: datetime | None, usuario_id: int | None,
           antes_de: int | None, limite: int) -> list[dict]:
    # Paginación por cursor (antes_de = último venta_id recibido): estable aunque entren ventas nuevas.
    return cx.execute(f"""
        {_RESUMEN}
        WHERE (%(desde)s::TIMESTAMPTZ IS NULL OR registrada_en >= %(desde)s)
          AND (%(hasta)s::TIMESTAMPTZ IS NULL OR registrada_en < %(hasta)s)
          AND (%(usuario)s::BIGINT IS NULL OR usuario_id = %(usuario)s)
          AND (%(antes)s::BIGINT IS NULL OR venta_id < %(antes)s)
        ORDER BY venta_id DESC LIMIT %(limite)s""",
        {"desde": desde, "hasta": hasta, "usuario": usuario_id, "antes": antes_de, "limite": limite}).fetchall()
