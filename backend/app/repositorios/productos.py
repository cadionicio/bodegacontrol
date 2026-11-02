"""SQL de catálogo. Solo consultas parametrizadas: ninguna entrada del usuario se concatena."""
from psycopg import Connection, sql

_COLUMNAS_EDITABLES = ("codigo", "nombre", "precio", "costo", "stock_minimo", "codigo_barras", "activo")


def listar(cx: Connection, buscar: str | None, incluir_inactivos: bool, solo_por_reponer: bool) -> list[dict]:
    return cx.execute("""
        SELECT * FROM bc.v_producto_stock
        WHERE (%(todos)s OR activo)
          AND (NOT %(reponer)s OR por_reponer)
          AND (%(buscar)s::TEXT IS NULL OR LOWER(nombre) LIKE '%%' || LOWER(%(buscar)s) || '%%'
               OR codigo = UPPER(%(buscar)s) OR codigo_barras = %(buscar)s)
        ORDER BY por_reponer DESC, nombre""",
        {"todos": incluir_inactivos, "reponer": solo_por_reponer, "buscar": buscar}).fetchall()


def obtener(cx: Connection, producto_id: int) -> dict | None:
    return cx.execute("SELECT * FROM bc.v_producto_stock WHERE producto_id = %s", (producto_id,)).fetchone()


def obtener_por_codigo_barras(cx: Connection, codigo_barras: str) -> dict | None:
    return cx.execute("SELECT * FROM bc.v_producto_stock WHERE codigo_barras = %s", (codigo_barras,)).fetchone()


def insertar(cx: Connection, datos: dict) -> int:
    return cx.execute("""
        INSERT INTO bc.producto (codigo, nombre, precio, costo, stock_minimo, codigo_barras)
        VALUES (%(codigo)s, %(nombre)s, %(precio)s, %(costo)s, %(stock_minimo)s, %(codigo_barras)s)
        RETURNING producto_id""", datos).fetchone()["producto_id"]


def actualizar(cx: Connection, producto_id: int, campos: dict) -> bool:
    # Los nombres de columna salen de una lista blanca y se citan con sql.Identifier.
    asignaciones = sql.SQL(", ").join(
        sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder(c)) for c in campos if c in _COLUMNAS_EDITABLES)
    consulta = sql.SQL("UPDATE bc.producto SET {} WHERE producto_id = %(id)s").format(asignaciones)
    return cx.execute(consulta, {**campos, "id": producto_id}).rowcount == 1


def bloquear_con_saldo(cx: Connection, ids: list[int]) -> list[dict]:
    """Bloquea los saldos en orden de id: dos ventas simultáneas esperan en fila y nunca se
    bloquean mutuamente (deadlock), y nadie vende stock que otra transacción ya comprometió."""
    return cx.execute("""
        SELECT p.producto_id, p.codigo, p.nombre, p.precio, p.costo, p.activo, s.cantidad AS stock
        FROM bc.producto p JOIN bc.inventario_saldo s USING (producto_id)
        WHERE p.producto_id = ANY(%s) ORDER BY p.producto_id FOR UPDATE OF s""", (ids,)).fetchall()


def guardar_imagen(cx: Connection, producto_id: int, tipo_mime: str, contenido: bytes) -> None:
    cx.execute("""INSERT INTO bc.producto_imagen (producto_id, tipo_mime, contenido) VALUES (%s, %s, %s)
                  ON CONFLICT (producto_id) DO UPDATE
                  SET tipo_mime = EXCLUDED.tipo_mime, contenido = EXCLUDED.contenido, actualizado_en = NOW()""",
               (producto_id, tipo_mime, contenido))


def obtener_imagen(cx: Connection, producto_id: int) -> dict | None:
    return cx.execute("""SELECT tipo_mime, contenido, EXTRACT(EPOCH FROM actualizado_en)::BIGINT AS version
                         FROM bc.producto_imagen WHERE producto_id = %s""", (producto_id,)).fetchone()


def eliminar_imagen(cx: Connection, producto_id: int) -> bool:
    return cx.execute("DELETE FROM bc.producto_imagen WHERE producto_id = %s", (producto_id,)).rowcount == 1
