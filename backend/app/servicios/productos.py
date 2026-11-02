"""Reglas del catálogo (RN-01). Los cambios de stock nunca pasan por aquí, sino por movimientos."""
from psycopg import Connection

from app.errores import ErrorNegocio, no_encontrado
from app.esquemas import ProductoCrear, ProductoEditar
from app.repositorios import inventario as repo_inventario, productos as repo
from app.seguridad import PROPIETARIO, UsuarioSesion


# Firma binaria de cada formato: un archivo renombrado (.exe → .jpg) no pasa la validación.
_FIRMAS_IMAGEN = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG\r\n\x1a\n": "image/png"}
TAMANO_MAXIMO_IMAGEN = 512_000


def _detectar_formato(contenido: bytes) -> str | None:
    if contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP":
        return "image/webp"
    return next((mime for firma, mime in _FIRMAS_IMAGEN.items() if contenido.startswith(firma)), None)


def presentar(producto: dict, usuario: UsuarioSesion) -> dict:
    """El costo y el margen son información del dueño; el cajero no los recibe."""
    return producto if usuario.rol == PROPIETARIO else {k: v for k, v in producto.items() if k != "costo"}


def listar(cx: Connection, usuario: UsuarioSesion, buscar: str | None, incluir_inactivos: bool,
           solo_por_reponer: bool) -> list[dict]:
    filas = repo.listar(cx, buscar or None, incluir_inactivos and usuario.rol == PROPIETARIO, solo_por_reponer)
    return [presentar(fila, usuario) for fila in filas]


def obtener(cx: Connection, usuario: UsuarioSesion, producto_id: int) -> dict:
    producto = repo.obtener(cx, producto_id)
    if not producto:
        raise no_encontrado("El producto")
    return presentar(producto, usuario)


def obtener_por_codigo_barras(cx: Connection, usuario: UsuarioSesion, codigo_barras: str) -> dict:
    producto = repo.obtener_por_codigo_barras(cx, codigo_barras.strip())
    if not producto or not producto["activo"]:
        # 404 permite a la app conservar el formulario y ofrecer búsqueda manual (matriz de errores 3.2).
        raise no_encontrado("Ningún producto activo con ese código de barras")
    return presentar(producto, usuario)


def crear(cx: Connection, usuario: UsuarioSesion, datos: ProductoCrear) -> dict:
    with cx.transaction():  # producto + saldo (trigger) + ALTA: todo o nada
        producto_id = repo.insertar(cx, datos.model_dump())
        if datos.stock_inicial:
            repo_inventario.registrar_movimiento(cx, producto_id, usuario.usuario_id, "ALTA", datos.stock_inicial)
    return obtener(cx, usuario, producto_id)


def editar(cx: Connection, usuario: UsuarioSesion, producto_id: int, cambios: ProductoEditar) -> dict:
    with cx.transaction():
        if not repo.actualizar(cx, producto_id, cambios.model_dump(exclude_unset=True)):
            raise no_encontrado("El producto")
    return obtener(cx, usuario, producto_id)


def desactivar(cx: Connection, producto_id: int) -> None:
    """Baja lógica: el producto deja de venderse pero su historial de ventas se conserva."""
    with cx.transaction():
        if not repo.actualizar(cx, producto_id, {"activo": False}):
            raise no_encontrado("El producto")


def guardar_imagen(cx: Connection, usuario: UsuarioSesion, producto_id: int, contenido: bytes) -> dict:
    if len(contenido) > TAMANO_MAXIMO_IMAGEN:
        raise ErrorNegocio(413, "IMAGEN_MUY_GRANDE", "La foto supera 500 KB; la app debe comprimirla antes de enviar")
    tipo_mime = _detectar_formato(contenido)
    if tipo_mime is None or len(contenido) < 100:
        raise ErrorNegocio(422, "IMAGEN_INVALIDA", "Envíe una foto JPEG, PNG o WebP")
    with cx.transaction():
        if not repo.obtener(cx, producto_id):
            raise no_encontrado("El producto")
        repo.guardar_imagen(cx, producto_id, tipo_mime, contenido)
    return obtener(cx, usuario, producto_id)


def obtener_imagen(cx: Connection, producto_id: int) -> dict:
    imagen = repo.obtener_imagen(cx, producto_id)
    if not imagen:
        raise no_encontrado("La imagen del producto")
    return imagen


def eliminar_imagen(cx: Connection, producto_id: int) -> None:
    with cx.transaction():
        if not repo.eliminar_imagen(cx, producto_id):
            raise no_encontrado("La imagen del producto")
