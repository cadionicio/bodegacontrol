"""Controlador de inventario: saldo, trazabilidad, reposiciones y mermas."""
from fastapi import APIRouter, Depends, Query
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import EntradaInventario, MermaInventario
from app.seguridad import UsuarioSesion, requerir_propietario, usuario_actual
from app.servicios import inventario as servicio

enrutador = APIRouter(prefix="/inventario", tags=["Inventario"])


@enrutador.get("/{producto_id}", summary="Saldo actual y últimos movimientos del producto")
def detalle(producto_id: int, limite: int = Query(30, ge=1, le=200),
            usuario: UsuarioSesion = Depends(usuario_actual), cx: Connection = Depends(obtener_conexion)):
    return servicio.detalle(cx, usuario, producto_id, limite)


@enrutador.post("/{producto_id}/entradas", status_code=201, summary="Registrar reposición")
def registrar_entrada(producto_id: int, datos: EntradaInventario,
                      usuario: UsuarioSesion = Depends(requerir_propietario),
                      cx: Connection = Depends(obtener_conexion)):
    return servicio.registrar_entrada(cx, usuario, producto_id, datos)


@enrutador.post("/{producto_id}/mermas", status_code=201, summary="Registrar merma (vencido, dañado, faltante)")
def registrar_merma(producto_id: int, datos: MermaInventario, usuario: UsuarioSesion = Depends(requerir_propietario),
                    cx: Connection = Depends(obtener_conexion)):
    return servicio.registrar_merma(cx, usuario, producto_id, datos)
