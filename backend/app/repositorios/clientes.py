"""SQL de clientes."""
from psycopg import Connection

_COLUMNAS = "cliente_id, tipo_documento, numero_documento, nombre, telefono, activo"


def listar(cx: Connection, buscar: str | None, limite: int) -> list[dict]:
    return cx.execute(f"""
        SELECT {_COLUMNAS} FROM bc.cliente
        WHERE activo AND (%(b)s::TEXT IS NULL OR numero_documento = %(b)s
                          OR LOWER(nombre) LIKE '%%' || LOWER(%(b)s) || '%%')
        ORDER BY nombre LIMIT %(limite)s""", {"b": buscar, "limite": limite}).fetchall()


def obtener_activo(cx: Connection, cliente_id: int) -> dict | None:
    return cx.execute(f"SELECT {_COLUMNAS} FROM bc.cliente WHERE cliente_id = %s AND activo",
                      (cliente_id,)).fetchone()


def insertar(cx: Connection, datos: dict) -> dict:
    return cx.execute(f"""
        INSERT INTO bc.cliente (tipo_documento, numero_documento, nombre, telefono)
        VALUES (%(tipo_documento)s, %(numero_documento)s, %(nombre)s, %(telefono)s)
        RETURNING {_COLUMNAS}""", datos).fetchone()
