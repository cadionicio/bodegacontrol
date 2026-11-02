"""SQL del libro de movimientos. El saldo lo ajusta el trigger tr_aplicar_movimiento."""
from psycopg import Connection


def registrar_movimiento(cx: Connection, producto_id: int, usuario_id: int, tipo: str, cantidad: int, *,
                         referencia: str | None = None, motivo: str | None = None,
                         costo_unitario=None, detalle_id: int | None = None) -> dict:
    return cx.execute("""
        INSERT INTO bc.movimiento_inventario
            (producto_id, usuario_id, tipo, cantidad, referencia, motivo_merma, costo_unitario, detalle_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING movimiento_id, tipo, cantidad, registrada_en""",
        (producto_id, usuario_id, tipo, cantidad, referencia, motivo, costo_unitario, detalle_id)).fetchone()


def movimientos(cx: Connection, producto_id: int, limite: int) -> list[dict]:
    return cx.execute("""
        SELECT movimiento_id, registrada_en, tipo, motivo_merma, cantidad, variacion, saldo_reconstruido,
               operador, venta_id, referencia
        FROM bc.v_trazabilidad_producto WHERE producto_id = %s
        ORDER BY registrada_en DESC, movimiento_id DESC LIMIT %s""", (producto_id, limite)).fetchall()
