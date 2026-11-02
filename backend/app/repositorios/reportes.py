"""SQL de reportes: agregados sobre intervalos semiabiertos [desde, hasta) de datos históricos."""
from datetime import datetime

from psycopg import Connection

_INTERVALO = "registrada_en >= %(desde)s AND registrada_en < %(hasta)s"


def totales_ventas(cx: Connection, desde: datetime, hasta: datetime) -> dict:
    # La ganancia solo suma ventas con costo completo; las demás se informan aparte para no inflarla.
    return cx.execute(f"""
        SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(unidades), 0) AS unidades,
               COALESCE(ROUND(AVG(total), 2), 0) AS ticket_promedio,
               COALESCE(SUM(ganancia), 0) AS ganancia_conocida,
               COUNT(*) FILTER (WHERE ganancia IS NULL) AS ventas_sin_costo
        FROM bc.v_venta_resumen WHERE {_INTERVALO}""", {"desde": desde, "hasta": hasta}).fetchone()


def ventas_por_metodo(cx: Connection, desde: datetime, hasta: datetime) -> list[dict]:
    return cx.execute(f"""
        SELECT metodo, COUNT(*) AS ventas, SUM(total) AS total FROM bc.v_venta_resumen
        WHERE {_INTERVALO} GROUP BY metodo ORDER BY total DESC""", {"desde": desde, "hasta": hasta}).fetchall()


def productos_mas_vendidos(cx: Connection, desde: datetime, hasta: datetime, limite: int = 5) -> list[dict]:
    return cx.execute(f"""
        SELECT producto_id, codigo, producto_actual AS nombre, SUM(cantidad) AS unidades, SUM(importe) AS total
        FROM bc.v_venta_detalle WHERE {_INTERVALO}
        GROUP BY producto_id, codigo, producto_actual ORDER BY unidades DESC, total DESC LIMIT %(limite)s""",
        {"desde": desde, "hasta": hasta, "limite": limite}).fetchall()


def indicador_mermas(cx: Connection, desde: datetime, hasta: datetime) -> dict:
    """% merma = costo perdido ÷ (costo vendido + costo perdido); ambos al costo congelado del evento."""
    return cx.execute(f"""
        WITH merma AS (SELECT COALESCE(SUM(cantidad), 0) AS unidades, COALESCE(SUM(valor_perdido), 0) AS valor
                       FROM bc.v_merma WHERE {_INTERVALO}),
             vendido AS (SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS costo
                         FROM bc.v_venta_detalle WHERE {_INTERVALO})
        SELECT merma.unidades, merma.valor AS valor_perdido,
               ROUND(100 * merma.valor / NULLIF(vendido.costo + merma.valor, 0), 2) AS porcentaje_merma
        FROM merma, vendido""", {"desde": desde, "hasta": hasta}).fetchone()


def mermas_por_motivo(cx: Connection, desde: datetime, hasta: datetime) -> list[dict]:
    return cx.execute(f"""
        SELECT motivo_merma AS motivo, SUM(cantidad) AS unidades, COALESCE(SUM(valor_perdido), 0) AS valor_perdido
        FROM bc.v_merma WHERE {_INTERVALO} GROUP BY motivo_merma ORDER BY valor_perdido DESC""",
        {"desde": desde, "hasta": hasta}).fetchall()


def filas_ventas(cx: Connection, desde: datetime, hasta: datetime) -> list[dict]:
    return cx.execute(f"""
        SELECT venta_id, registrada_en, cajero, COALESCE(cliente, 'Cliente general') AS cliente, metodo,
               lineas, unidades, total, costo_total, ganancia
        FROM bc.v_venta_resumen WHERE {_INTERVALO} ORDER BY registrada_en, venta_id""",
        {"desde": desde, "hasta": hasta}).fetchall()


def filas_mermas(cx: Connection, desde: datetime, hasta: datetime) -> list[dict]:
    return cx.execute(f"""
        SELECT movimiento_id, registrada_en, codigo, nombre, motivo_merma AS motivo, cantidad, costo_unitario,
               valor_perdido, observacion, registrado_por
        FROM bc.v_merma WHERE {_INTERVALO} ORDER BY registrada_en, movimiento_id""",
        {"desde": desde, "hasta": hasta}).fetchall()


def serie_diaria(cx: Connection, primer_dia, ultimo_dia, zona: str) -> list[dict]:
    """Un punto por día local, incluidos los días sin ventas (generate_series evita huecos en el gráfico)."""
    return cx.execute("""
        WITH dias AS (SELECT generate_series(%(primero)s::DATE, %(ultimo)s::DATE, INTERVAL '1 day')::DATE AS fecha),
             ventas AS (SELECT (registrada_en AT TIME ZONE %(zona)s)::DATE AS fecha, total FROM bc.v_venta_resumen
                        WHERE registrada_en >= (%(primero)s::DATE::TIMESTAMP AT TIME ZONE %(zona)s)
                          AND registrada_en < ((%(ultimo)s::DATE + 1)::TIMESTAMP AT TIME ZONE %(zona)s))
        SELECT d.fecha, COUNT(v.total) AS ventas, COALESCE(SUM(v.total), 0) AS total
        FROM dias d LEFT JOIN ventas v USING (fecha) GROUP BY d.fecha ORDER BY d.fecha""",
        {"primero": primer_dia, "ultimo": ultimo_dia, "zona": zona}).fetchall()


def estado_catalogo(cx: Connection) -> dict:
    return cx.execute("""SELECT COUNT(*) FILTER (WHERE activo) AS productos_activos,
                                COUNT(*) FILTER (WHERE activo AND por_reponer) AS por_reponer,
                                COALESCE(SUM(stock) FILTER (WHERE activo), 0) AS unidades
                         FROM bc.v_producto_stock""").fetchone()


def registrar_exportacion(cx: Connection, usuario_id: int, tipo: str, formato: str, periodo: str,
                          desde: datetime, hasta: datetime, filas: int) -> None:
    cx.execute("""INSERT INTO bc.reporte_exportacion
                  (usuario_id, tipo_reporte, formato, periodo, desde, hasta_exclusivo, cantidad_filas)
                  VALUES (%s, %s, %s, %s, %s, %s, %s)""", (usuario_id, tipo, formato, periodo, desde, hasta, filas))
