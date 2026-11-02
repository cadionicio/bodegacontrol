"""Confirmación de venta (PR-04): la operación de negocio más allá del CRUD.

Secuencia dentro de UNA transacción: candado por clave idempotente → reintento idéntico devuelve la
venta original → bloqueo de saldos → validación de cliente, productos, stock y efectivo con precios del
servidor → venta + detalle + salidas (el trigger descuenta stock) + pago → COMMIT, donde la BD verifica
además que la venta esté completa y cuadrada. Cualquier fallo revierte todo (RNF-01).
"""
import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from psycopg import Connection

from app.errores import ErrorNegocio, no_encontrado
from app.esquemas import VentaCrear
from app.repositorios import clientes as repo_clientes, inventario as repo_inventario, \
    productos as repo_productos, ventas as repo
from app.seguridad import CAJERO, UsuarioSesion
from app.servicios.periodos import intervalo_de_fechas

CENTIMO = Decimal("0.01")


def _firma(datos: VentaCrear) -> str:
    """SHA-256 del contenido normalizado: el orden de líneas o "20" vs "20.00" no cambian la firma (RN-07)."""
    pago = datos.pago.model_dump()
    if pago["importe_recibido"] is not None:
        pago["importe_recibido"] = str(pago["importe_recibido"].quantize(CENTIMO))
    contenido = {"cliente_id": datos.cliente_id, "pago": pago,
                 "lineas": sorted((linea.producto_id, linea.cantidad) for linea in datos.lineas)}
    return hashlib.sha256(json.dumps(contenido, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _validar_disponibilidad(datos: VentaCrear, productos: dict[int, dict]) -> Decimal:
    """Reporta TODAS las líneas con problema a la vez: el cajero corrige solo esas, sin rehacer el carrito."""
    no_disponibles = [{"producto_id": l.producto_id, "motivo": "INEXISTENTE" if l.producto_id not in productos
                       else "INACTIVO"} for l in datos.lineas
                      if l.producto_id not in productos or not productos[l.producto_id]["activo"]]
    if no_disponibles:
        raise ErrorNegocio(422, "PRODUCTO_NO_DISPONIBLE", "Hay productos que ya no se pueden vender",
                           no_disponibles, conservar_borrador=True)
    faltantes = [{"producto_id": l.producto_id, "nombre": productos[l.producto_id]["nombre"],
                  "solicitado": l.cantidad, "disponible": productos[l.producto_id]["stock"]}
                 for l in datos.lineas if l.cantidad > productos[l.producto_id]["stock"]]
    if faltantes:
        raise ErrorNegocio(409, "STOCK_INSUFICIENTE", "Cantidad no disponible", faltantes, conservar_borrador=True)
    return sum((productos[l.producto_id]["precio"] * l.cantidad for l in datos.lineas), Decimal("0"))


_DATOS_DEL_DUENO = ("costo_total", "ganancia")


def _sin_costos(fila: dict, usuario: UsuarioSesion) -> dict:
    """Costo y ganancia son información del propietario; el cajero no los recibe."""
    return fila if usuario.rol != CAJERO else {k: v for k, v in fila.items() if k not in _DATOS_DEL_DUENO}


def _respuesta(cx: Connection, usuario: UsuarioSesion, venta_id: int, repetida: bool) -> dict:
    return _sin_costos({"estado": "CONFIRMADA", "repetida": repetida, **repo.resumen(cx, venta_id),
                        "detalle": [_sin_costos(linea, usuario) for linea in repo.lineas(cx, venta_id)]}, usuario)


def registrar(cx: Connection, usuario: UsuarioSesion, datos: VentaCrear) -> tuple[dict, bool]:
    """Devuelve (venta, es_nueva). es_nueva=False indica un reintento idempotente (HTTP 200, no 201)."""
    firma = _firma(datos)
    with cx.transaction():
        repo.bloquear_clave(cx, datos.clave_idempotencia)
        existente = repo.buscar_por_clave(cx, datos.clave_idempotencia)
        if existente:
            if existente["solicitud_firma"] != firma or existente["usuario_id"] != usuario.usuario_id:
                raise ErrorNegocio(409, "CLAVE_REUTILIZADA",
                                   "Esa clave ya se usó con otra venta; genere una clave nueva")
            venta_id, es_nueva = existente["venta_id"], False
        else:
            if datos.cliente_id and not repo_clientes.obtener_activo(cx, datos.cliente_id):
                raise ErrorNegocio(422, "CLIENTE_NO_DISPONIBLE", "El cliente no existe o está inactivo",
                                   [{"campo": "cliente_id"}], conservar_borrador=True)
            lineas = sorted(datos.lineas, key=lambda linea: linea.producto_id)
            productos = {p["producto_id"]: p for p in
                         repo_productos.bloquear_con_saldo(cx, [linea.producto_id for linea in lineas])}
            total = _validar_disponibilidad(datos, productos)
            pago = datos.pago.model_dump()
            if pago["metodo"] == "EFECTIVO" and pago["importe_recibido"] < total:
                raise ErrorNegocio(422, "EFECTIVO_INSUFICIENTE", "El importe recibido no cubre el total", [
                    {"campo": "pago.importe_recibido", "total": total, "recibido": pago["importe_recibido"]}], True)
            venta_id, es_nueva = repo.insertar_venta(cx, usuario.usuario_id, datos.cliente_id,
                                                     datos.clave_idempotencia, firma), True
            for linea in lineas:
                detalle_id = repo.insertar_detalle(cx, venta_id, productos[linea.producto_id], linea.cantidad)
                repo_inventario.registrar_movimiento(cx, linea.producto_id, usuario.usuario_id, "SALIDA_VENTA",
                                                     linea.cantidad, detalle_id=detalle_id)
            repo.insertar_pago(cx, venta_id, pago, total, usuario.usuario_id)
    return _respuesta(cx, usuario, venta_id, repetida=not es_nueva), es_nueva


def obtener(cx: Connection, usuario: UsuarioSesion, venta_id: int) -> dict:
    venta = repo.resumen(cx, venta_id)
    # Un cajero solo ve sus ventas; 404 (no 403) para no revelar que la venta existe.
    if not venta or (usuario.rol == CAJERO and venta["usuario_id"] != usuario.usuario_id):
        raise no_encontrado("La venta")
    return _respuesta(cx, usuario, venta_id, repetida=False)


def estado_por_clave(cx: Connection, usuario: UsuarioSesion, clave: UUID) -> tuple[int, dict]:
    """Reconciliación tras un timeout (RF-10): la app consulta antes de reintentar."""
    venta = repo.buscar_por_clave(cx, clave)
    if venta and (usuario.rol != CAJERO or venta["usuario_id"] == usuario.usuario_id):
        return 200, _respuesta(cx, usuario, venta["venta_id"], repetida=True)
    if repo.clave_en_proceso(cx, clave):
        return 202, {"estado": "EN_PROCESO", "mensaje": "La venta se está registrando; consulte en unos segundos"}
    raise ErrorNegocio(404, "VENTA_NO_REGISTRADA",
                       "No hay venta con esa clave; puede reenviarla con la MISMA clave sin riesgo de duplicar",
                       conservar_borrador=True)


def listar(cx: Connection, usuario: UsuarioSesion, desde: date | None, hasta: date | None,
           antes_de: int | None, limite: int) -> list[dict]:
    inicio, fin = intervalo_de_fechas(desde, hasta)
    filas = repo.listar(cx, inicio, fin, usuario.usuario_id if usuario.rol == CAJERO else None, antes_de, limite)
    return [_sin_costos(fila, usuario) for fila in filas]
