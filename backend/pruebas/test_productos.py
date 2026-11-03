"""CRUD de productos (T-01, T-02) con comprobación directa en PostgreSQL."""
from decimal import Decimal

API = "/api/v1/productos"
NUEVO = {"nombre": "  Chicle Trident  ", "precio": 1.50, "costo": 0.90,
         "stock_minimo": 5, "stock_inicial": 20, "codigo_barras": "7750885001234"}


def test_t01_crud_completo_persistido(cliente_http, propietario, sql):
    creado = cliente_http.post(API, headers=propietario, json=NUEVO)
    assert creado.status_code == 201
    producto = creado.json()
    assert (producto["codigo"], producto["nombre"], producto["stock"]) == ("P0009", "Chicle Trident", 20)  # correlativo asignado
    assert sql("SELECT tipo, cantidad FROM bc.movimiento_inventario WHERE producto_id = %s",
               producto["producto_id"]) == [("ALTA", 20)]

    url = f"{API}/{producto['producto_id']}"
    assert any(p["codigo"] == "P0009" for p in cliente_http.get(API, headers=propietario, params={"buscar": "chicle"}).json())
    editado = cliente_http.patch(url, headers=propietario, json={"precio": 1.80, "costo": None})
    assert editado.status_code == 200 and editado.json()["precio"] == 1.80 and editado.json()["costo"] is None
    assert sql("SELECT precio, costo FROM bc.producto WHERE codigo = 'P0009'") == [(Decimal("1.80"), None)]

    assert cliente_http.delete(url, headers=propietario).status_code == 204
    assert sql("SELECT activo FROM bc.producto WHERE codigo = 'P0009'") == [(False,)]
    assert all(p["codigo"] != "P0009" for p in cliente_http.get(API, headers=propietario).json())
    assert cliente_http.get(url, headers=propietario).json()["activo"] is False  # historial conservado


def test_t02_codigo_duplicado_es_409_sin_fila_extra(cliente_http, propietario, sql):
    """El código interno ya no lo escribe nadie; el duplicado posible es el código de barras."""
    cliente_http.post(API, headers=propietario, json=NUEVO)
    antes = sql("SELECT COUNT(*) FROM bc.producto")[0][0]
    respuesta = cliente_http.post(API, headers=propietario, json={**NUEVO, "nombre": "Otro"})
    assert respuesta.status_code == 409 and respuesta.json()["codigo"] == "CODIGO_BARRAS_DUPLICADO"
    assert sql("SELECT COUNT(*) FROM bc.producto")[0][0] == antes


def test_codigo_lo_asigna_el_sistema_y_no_se_edita(cliente_http, propietario):
    codigos = [cliente_http.post(API, headers=propietario, json={"nombre": n, "precio": 1}).json()["codigo"] for n in ("A", "B")]
    assert codigos == ["P0009", "P0010"]
    assert cliente_http.post(API, headers=propietario, json={"codigo": "X1", "nombre": "C", "precio": 1}).status_code == 400
    assert cliente_http.patch(f"{API}/1", headers=propietario, json={"codigo": "X1"}).status_code == 400


def test_stock_no_se_edita_por_patch(cliente_http, propietario):
    respuesta = cliente_http.patch(f"{API}/1", headers=propietario, json={"stock": 999})
    assert respuesta.status_code == 400


def test_patch_vacio_o_inexistente(cliente_http, propietario):
    assert cliente_http.patch(f"{API}/1", headers=propietario, json={}).status_code == 400
    assert cliente_http.patch(f"{API}/9999", headers=propietario, json={"precio": 2}).status_code == 404


def test_escaneo_encuentra_producto_o_404_para_busqueda_manual(cliente_http, propietario, cajero):
    cliente_http.post(API, headers=propietario, json=NUEVO)
    assert cliente_http.get(f"{API}/codigo-barras/7750885001234", headers=cajero).json()["codigo"] == "P0009"
    ausente = cliente_http.get(f"{API}/codigo-barras/0000000000000", headers=cajero)
    assert ausente.status_code == 404 and ausente.json()["mensaje"] == "No hay un producto activo con ese código de barras"


def test_filtro_por_reponer(cliente_http, cajero):
    codigos = [p["codigo"] for p in cliente_http.get(API, headers=cajero, params={"por_reponer": True}).json()]
    assert codigos == ["P0006", "P0003"]  # azúcar y galletas inician bajo su stock mínimo


# JPEG mínimo válido (1×1 px): la API valida la firma binaria real, no la extensión ni la cabecera.
JPEG = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffdb004300") + bytes(64) + bytes.fromhex(
    "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffda0008010100003f00d2cf20ffd9")


def test_foto_de_producto_subir_ver_reemplazar_y_quitar(cliente_http, propietario, cajero):
    url = f"{API}/1/imagen"
    assert cliente_http.get(url).status_code == 404
    subida = cliente_http.put(url, headers={**propietario, "Content-Type": "image/jpeg"}, content=JPEG)
    assert subida.status_code == 200 and subida.json()["imagen_version"] is not None
    foto = cliente_http.get(url)  # pública: <img src> no envía token
    assert foto.status_code == 200 and foto.headers["content-type"] == "image/jpeg" and foto.content == JPEG
    assert cliente_http.delete(url, headers=propietario).status_code == 204
    assert cliente_http.get(f"{API}/1", headers=cajero).json()["imagen_version"] is None


def test_foto_invalida_grande_o_sin_permiso(cliente_http, propietario, cajero):
    url = f"{API}/1/imagen"
    falsa = cliente_http.put(url, headers={**propietario, "Content-Type": "image/jpeg"}, content=b"MZ" + bytes(500))
    grande = cliente_http.put(url, headers={**propietario, "Content-Type": "image/jpeg"}, content=JPEG + bytes(600_000))
    ajena = cliente_http.put(url, headers={**cajero, "Content-Type": "image/jpeg"}, content=JPEG)
    assert (falsa.json()["codigo"], grande.status_code, ajena.status_code) == ("IMAGEN_INVALIDA", 413, 403)
