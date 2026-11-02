"""Controlador de clientes (ambos roles pueden buscar y registrar)."""
from fastapi import APIRouter, Depends, Query
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import ClienteCrear
from app.seguridad import usuario_actual
from app.servicios import clientes as servicio

enrutador = APIRouter(prefix="/clientes", tags=["Clientes"], dependencies=[Depends(usuario_actual)])


@enrutador.get("", summary="Buscar clientes por nombre o documento")
def listar(buscar: str | None = Query(None, max_length=140), limite: int = Query(20, ge=1, le=100),
           cx: Connection = Depends(obtener_conexion)):
    return servicio.listar(cx, buscar, limite)


@enrutador.post("", status_code=201, summary="Registrar cliente")
def crear(datos: ClienteCrear, cx: Connection = Depends(obtener_conexion)):
    return servicio.crear(cx, datos)
