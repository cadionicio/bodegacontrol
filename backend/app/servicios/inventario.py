"""Reposición (PR-03) y mermas: ambos son movimientos; el trigger ajusta el saldo atómicamente."""
from psycopg import Connection

from app.errores import ErrorNegocio, no_encontrado
from app.esquemas import EntradaInventario, MermaInventario
from app.repositorios import inventario as repo, productos as repo_productos
from app.seguridad import UsuarioSesion
from app.servicios.productos import presentar


def detalle(cx: Connection, usuario: UsuarioSesion, producto_id: int, limite: int) -> dict:
    producto = repo_productos.obtener(cx, producto_id)
    if not producto:
        raise no_encontrado("El producto")
    return {"producto": presentar(producto, usuario), "movimientos": repo.movimientos(cx, producto_id, limite)}


def _bloquear_producto(cx: Connection, producto_id: int) -> dict:
    filas = repo_productos.bloquear_con_saldo(cx, [producto_id])
    if not filas:
        raise no_encontrado("El producto")
    return filas[0]


def registrar_entrada(cx: Connection, usuario: UsuarioSesion, producto_id: int, datos: EntradaInventario) -> dict:
    with cx.transaction():
        if not _bloquear_producto(cx, producto_id)["activo"]:
            raise ErrorNegocio(422, "PRODUCTO_INACTIVO", "Reactive el producto antes de reponerlo")
        if datos.nuevo_costo is not None:
            repo_productos.actualizar(cx, producto_id, {"costo": datos.nuevo_costo})
        movimiento = repo.registrar_movimiento(cx, producto_id, usuario.usuario_id, "ENTRADA", datos.cantidad,
                                               referencia=datos.referencia)
    return {"movimiento": movimiento, **detalle(cx, usuario, producto_id, 10)}


def registrar_merma(cx: Connection, usuario: UsuarioSesion, producto_id: int, datos: MermaInventario) -> dict:
    with cx.transaction():
        producto = _bloquear_producto(cx, producto_id)  # bloqueo: una venta simultánea no puede usar ese stock
        if datos.cantidad > producto["stock"]:
            raise ErrorNegocio(409, "STOCK_INSUFICIENTE", "La merma supera el stock disponible", [
                {"producto_id": producto_id, "solicitado": datos.cantidad, "disponible": producto["stock"]}], True)
        # Costo congelado: la pérdida en soles no cambia si mañana se actualiza el costo.
        movimiento = repo.registrar_movimiento(cx, producto_id, usuario.usuario_id, "MERMA", datos.cantidad,
                                               referencia=datos.observacion, motivo=datos.motivo,
                                               costo_unitario=producto["costo"])
    return {"movimiento": movimiento, **detalle(cx, usuario, producto_id, 10)}
