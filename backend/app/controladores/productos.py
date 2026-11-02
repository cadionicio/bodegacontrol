"""Controlador de catálogo: CRUD de productos (lectura para todos, escritura solo PROPIETARIO)."""
from fastapi import APIRouter, Depends, Query, Response
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import ProductoCrear, ProductoEditar
from app.seguridad import UsuarioSesion, requerir_propietario, usuario_actual
from app.servicios import productos as servicio

enrutador = APIRouter(prefix="/productos", tags=["Productos"])


@enrutador.get("", summary="Listar y buscar productos")
def listar(buscar: str | None = Query(None, max_length=120, description="Nombre, código o código de barras"),
           incluir_inactivos: bool = False, por_reponer: bool = False,
           usuario: UsuarioSesion = Depends(usuario_actual), cx: Connection = Depends(obtener_conexion)):
    return servicio.listar(cx, usuario, buscar, incluir_inactivos, por_reponer)


@enrutador.get("/codigo-barras/{codigo_barras}", summary="Buscar producto escaneado (EAN/UPC/QR)")
def por_codigo_barras(codigo_barras: str, usuario: UsuarioSesion = Depends(usuario_actual),
                      cx: Connection = Depends(obtener_conexion)):
    return servicio.obtener_por_codigo_barras(cx, usuario, codigo_barras)


@enrutador.get("/{producto_id}", summary="Detalle de un producto")
def obtener(producto_id: int, usuario: UsuarioSesion = Depends(usuario_actual),
            cx: Connection = Depends(obtener_conexion)):
    return servicio.obtener(cx, usuario, producto_id)


@enrutador.post("", status_code=201, summary="Crear producto con stock inicial")
def crear(datos: ProductoCrear, usuario: UsuarioSesion = Depends(requerir_propietario),
          cx: Connection = Depends(obtener_conexion)):
    return servicio.crear(cx, usuario, datos)


@enrutador.patch("/{producto_id}", summary="Editar campos del producto (no el stock)")
def editar(producto_id: int, cambios: ProductoEditar, usuario: UsuarioSesion = Depends(requerir_propietario),
           cx: Connection = Depends(obtener_conexion)):
    return servicio.editar(cx, usuario, producto_id, cambios)


@enrutador.delete("/{producto_id}", status_code=204, summary="Desactivar producto (baja lógica)")
def desactivar(producto_id: int, _: UsuarioSesion = Depends(requerir_propietario),
               cx: Connection = Depends(obtener_conexion)):
    servicio.desactivar(cx, producto_id)
    return Response(status_code=204)
