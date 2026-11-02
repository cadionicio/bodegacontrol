"""Clientes identificados (RF-11). El cliente general no se registra: es cliente_id NULL."""
from psycopg import Connection

from app.esquemas import ClienteCrear
from app.repositorios import clientes as repo


def listar(cx: Connection, buscar: str | None, limite: int) -> list[dict]:
    return repo.listar(cx, (buscar or "").strip() or None, limite)


def crear(cx: Connection, datos: ClienteCrear) -> dict:
    with cx.transaction():  # un documento duplicado lo rechaza uq_cliente_documento → 409
        return repo.insertar(cx, datos.model_dump())
