"""Entorno de pruebas: cada prueba parte de una base recién creada con el esquema y datos iniciales.

ADVERTENCIA: DATABASE_URL_PRUEBAS se BORRA y recrea. Nunca apuntarla a la base de producción.
"""
import os
from pathlib import Path

import psycopg
import pytest

URL_PRUEBAS = os.environ.get("DATABASE_URL_PRUEBAS")
if not URL_PRUEBAS:
    pytest.exit("Defina DATABASE_URL_PRUEBAS con una base desechable (ver README)", returncode=2)
os.environ["DATABASE_URL"] = URL_PRUEBAS
os.environ.setdefault("JWT_SECRETO", "secreto-de-pruebas-con-mas-de-32-caracteres")

from fastapi.testclient import TestClient  # noqa: E402  (importar tras fijar el entorno)

from app.main import app  # noqa: E402

CARPETA_SQL = Path(__file__).resolve().parents[2] / "base-datos"
SCRIPTS = [(CARPETA_SQL / nombre).read_text(encoding="utf-8")
           for nombre in ("01_esquema.sql", "02_datos_iniciales.sql")]
PROPIETARIO = {"correo": "cadionicio@gmail.com", "contrasena": "Propietario2026"}
CAJERO = {"correo": "giancarlo@uni.pe", "contrasena": "Cajero2026"}


def recrear_base() -> None:
    with psycopg.connect(URL_PRUEBAS, autocommit=True) as cx:
        cx.execute("DROP SCHEMA IF EXISTS bc CASCADE")
        for script in SCRIPTS:
            cx.execute(script)


@pytest.fixture(scope="session")
def cliente_http():
    with TestClient(app) as cliente:
        yield cliente


@pytest.fixture(autouse=True)
def base_limpia():
    recrear_base()


def _cabeceras(cliente_http, credenciales) -> dict:
    token = cliente_http.post("/api/v1/auth/login", json=credenciales).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def propietario(cliente_http) -> dict:
    return _cabeceras(cliente_http, PROPIETARIO)


@pytest.fixture
def cajero(cliente_http) -> dict:
    return _cabeceras(cliente_http, CAJERO)


@pytest.fixture
def sql():
    """Consulta directa a PostgreSQL para comprobar que el cambio quedó persistido de verdad."""
    with psycopg.connect(URL_PRUEBAS, autocommit=True) as cx:
        def ejecutar(consulta, *parametros):
            cursor = cx.execute(consulta, parametros or None)
            return cursor.fetchall() if cursor.description else cursor.rowcount
        yield ejecutar
