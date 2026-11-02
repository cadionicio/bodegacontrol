"""Controlador de ventas: confirmación idempotente, reconciliación por clave e historial."""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import VentaCrear
from app.seguridad import UsuarioSesion, usuario_actual
from app.servicios import ventas as servicio

enrutador = APIRouter(prefix="/ventas", tags=["Ventas"])


@enrutador.post("", status_code=201, summary="Confirmar venta (transaccional e idempotente)",
                description="201 = venta nueva; 200 = reintento con la misma clave (no se duplica).")
def registrar(datos: VentaCrear, respuesta: Response, usuario: UsuarioSesion = Depends(usuario_actual),
              cx: Connection = Depends(obtener_conexion)):
    venta, es_nueva = servicio.registrar(cx, usuario, datos)
    respuesta.status_code = 201 if es_nueva else 200
    return venta


# Declarada antes de /{venta_id} para que "estado" no se interprete como un identificador.
@enrutador.get("/estado", summary="Consultar estado por clave de idempotencia (tras un timeout)",
               description="200 = confirmada; 202 = en proceso; 404 = no registrada (reenviar con la misma clave).")
def estado(clave: UUID, respuesta: Response, usuario: UsuarioSesion = Depends(usuario_actual),
           cx: Connection = Depends(obtener_conexion)):
    respuesta.status_code, cuerpo = servicio.estado_por_clave(cx, usuario, clave)
    return cuerpo


@enrutador.get("", summary="Historial de ventas (el cajero solo ve las suyas)")
def listar(desde: date | None = None, hasta: date | None = None,
           antes_de: int | None = Query(None, gt=0, description="Cursor: último venta_id recibido"),
           limite: int = Query(30, ge=1, le=100), usuario: UsuarioSesion = Depends(usuario_actual),
           cx: Connection = Depends(obtener_conexion)):
    return servicio.listar(cx, usuario, desde, hasta, antes_de, limite)


@enrutador.get("/{venta_id}", summary="Detalle de venta con líneas y movimientos de inventario")
def obtener(venta_id: int, usuario: UsuarioSesion = Depends(usuario_actual),
            cx: Connection = Depends(obtener_conexion)):
    return servicio.obtener(cx, usuario, venta_id)
