"""Acceso a PostgreSQL: pool de conexiones compartido por la aplicación."""
from collections.abc import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.configuracion import configuracion

# autocommit=True: las lecturas no dejan transacciones abiertas y cada escritura de negocio se
# agrupa explícitamente con `with conexion.transaction()` en su servicio. Así el COMMIT (y las
# validaciones diferidas de la BD) ocurre ANTES de responder, nunca después de enviar un 201.
# open=False: el pool se abre en el ciclo de vida de la app, no al importar (requisito en Vercel).
# check: Neon suspende la base tras 5 min sin uso y corta las conexiones; verificar cada conexión antes
# de entregarla evita que la primera petición tras la inactividad falle con una conexión muerta.
pool = ConnectionPool(configuracion.url_base_datos, min_size=1, max_size=configuracion.tamano_pool,
                      open=False, check=ConnectionPool.check_connection, max_idle=240,
                      kwargs={"row_factory": dict_row, "autocommit": True})


def obtener_conexion() -> Iterator[Connection]:
    """Dependencia FastAPI: una conexión por solicitud, compartida por autenticación y servicio."""
    with pool.connection() as conexion:
        yield conexion
