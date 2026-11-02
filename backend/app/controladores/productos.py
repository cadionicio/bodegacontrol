"""Controlador de catálogo: CRUD de productos (lectura para todos, escritura solo PROPIETARIO)."""
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
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


@enrutador.put("/{producto_id}/imagen", summary="Subir o reemplazar la foto (cuerpo binario JPEG/PNG/WebP)",
               openapi_extra={"requestBody": {"required": True, "content": {
                   m: {"schema": {"type": "string", "format": "binary"}} for m in ("image/jpeg", "image/png", "image/webp")}}})
async def guardar_imagen(producto_id: int, solicitud: Request, usuario: UsuarioSesion = Depends(requerir_propietario),
                         cx: Connection = Depends(obtener_conexion)):
    # Lectura asíncrona del cuerpo; el acceso a BD (bloqueante) se delega a un hilo para no frenar el servidor.
    contenido = await solicitud.body()
    return await run_in_threadpool(servicio.guardar_imagen, cx, usuario, producto_id, contenido)


@enrutador.get("/{producto_id}/imagen", summary="Foto del producto (pública, cacheable)",
               description="Sin token para que <img> pueda cargarla; una foto de catálogo no es dato sensible.")
def obtener_imagen(producto_id: int, cx: Connection = Depends(obtener_conexion)):
    imagen = servicio.obtener_imagen(cx, producto_id)
    # La URL lleva ?v=imagen_version: al cambiar la foto cambia la URL, por eso puede cachearse un año.
    return Response(bytes(imagen["contenido"]), media_type=imagen["tipo_mime"],
                    headers={"Cache-Control": "public, max-age=31536000, immutable", "ETag": f'"{imagen["version"]}"'})


@enrutador.delete("/{producto_id}/imagen", status_code=204, summary="Quitar la foto del producto")
def eliminar_imagen(producto_id: int, _: UsuarioSesion = Depends(requerir_propietario),
                    cx: Connection = Depends(obtener_conexion)):
    servicio.eliminar_imagen(cx, producto_id)
    return Response(status_code=204)
