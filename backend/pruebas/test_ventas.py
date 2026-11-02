"""Venta transaccional (T-03..T-06, T-09), idempotencia, concurrencia (RNF-02) y conciliación."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from conftest import CAJERO

API = "/api/v1/ventas"


def venta(lineas, metodo="EFECTIVO", clave=None, **pago):
    pago = {"metodo": metodo, **({"importe_recibido": 100} if metodo == "EFECTIVO" else {}), **pago}
    return {"clave_idempotencia": str(clave or uuid.uuid4()),
            "lineas": [{"producto_id": p, "cantidad": c} for p, c in lineas], "pago": pago}


def stock(sql, producto_id):
    return sql("SELECT cantidad FROM bc.inventario_saldo WHERE producto_id = %s", producto_id)[0][0]


def test_t03_venta_correcta_registra_todo_en_una_transaccion(cliente_http, cajero, sql):
    respuesta = cliente_http.post(API, headers=cajero, json=venta([(1, 2)], importe_recibido=20))
    cuerpo = respuesta.json()
    assert respuesta.status_code == 201
    assert (cuerpo["estado"], cuerpo["total"], cuerpo["vuelto"], cuerpo["repetida"]) == ("CONFIRMADA", 7.0, 13.0, False)
    assert stock(sql, 1) == 46
    # Venta, detalle con precio histórico, salida trazable y pago por el total (no por lo recibido).
    assert sql("SELECT d.precio_unitario, m.tipo, m.cantidad, p.monto, p.importe_recibido FROM bc.detalle_venta d "
               "JOIN bc.movimiento_inventario m USING (detalle_id) JOIN bc.venta_pago p USING (venta_id) "
               "WHERE d.venta_id = %s", cuerpo["venta_id"]) == [
        (Decimal("3.50"), "SALIDA_VENTA", 2, Decimal("7.00"), Decimal("20.00"))]


def test_precio_lo_decide_el_servidor_aunque_el_cliente_envie_otro(cliente_http, cajero):
    cuerpo = venta([(1, 1)])
    cuerpo["lineas"][0]["precio_unitario"] = 0.01
    assert cliente_http.post(API, headers=cajero, json=cuerpo).status_code == 400


def test_t04_falta_de_stock_no_escribe_nada_y_detalla_la_linea(cliente_http, cajero, sql):
    respuesta = cliente_http.post(API, headers=cajero, json=venta([(1, 2), (3, 9)]))
    cuerpo = respuesta.json()
    assert respuesta.status_code == 409 and cuerpo["codigo"] == "STOCK_INSUFICIENTE"
    assert cuerpo["conservar_borrador"] is True
    assert cuerpo["errores"] == [{"producto_id": 3, "nombre": "Galletas Ritz 6 und.", "solicitado": 9,
                                  "disponible": 8}]
    assert sql("SELECT COUNT(*) FROM bc.venta")[0][0] == 0 and stock(sql, 1) == 48  # sin escritura parcial


def test_t05_reintento_identico_no_duplica_la_venta(cliente_http, cajero, sql):
    cuerpo = venta([(2, 1), (1, 1)])
    primera = cliente_http.post(API, headers=cajero, json=cuerpo)
    cuerpo["lineas"].reverse()  # mismo contenido en otro orden: misma firma
    segunda = cliente_http.post(API, headers=cajero, json=cuerpo)
    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert primera.json()["venta_id"] == segunda.json()["venta_id"] and segunda.json()["repetida"] is True
    assert sql("SELECT COUNT(*) FROM bc.venta")[0][0] == 1 and stock(sql, 1) == 47


def test_t05_misma_clave_con_otro_contenido_es_409(cliente_http, cajero, sql):
    clave = uuid.uuid4()
    cliente_http.post(API, headers=cajero, json=venta([(1, 1)], clave=clave))
    respuesta = cliente_http.post(API, headers=cajero, json=venta([(1, 5)], clave=clave))
    assert respuesta.status_code == 409 and respuesta.json()["codigo"] == "CLAVE_REUTILIZADA"
    assert sql("SELECT COUNT(*) FROM bc.venta")[0][0] == 1


def test_t06_reconciliacion_por_clave_tras_corte_de_red(cliente_http, cajero):
    clave = uuid.uuid4()
    antes = cliente_http.get(f"{API}/estado", headers=cajero, params={"clave": str(clave)})
    assert antes.status_code == 404 and antes.json()["codigo"] == "VENTA_NO_REGISTRADA"
    cliente_http.post(API, headers=cajero, json=venta([(1, 1)], clave=clave))  # la app "no vio" la respuesta
    despues = cliente_http.get(f"{API}/estado", headers=cajero, params={"clave": str(clave)})
    assert despues.status_code == 200 and despues.json()["estado"] == "CONFIRMADA"


def test_efectivo_insuficiente_es_422_y_conserva_borrador(cliente_http, cajero, sql):
    respuesta = cliente_http.post(API, headers=cajero, json=venta([(7, 2)], importe_recibido=20))
    assert respuesta.status_code == 422 and respuesta.json()["codigo"] == "EFECTIVO_INSUFICIENTE"
    assert respuesta.json()["errores"][0]["total"] == 23.8
    assert sql("SELECT COUNT(*) FROM bc.venta")[0][0] == 0


def test_t09_pago_externo_sin_referencia_se_rechaza(cliente_http, cajero, sql):
    assert cliente_http.post(API, headers=cajero, json=venta([(1, 1)], "YAPE")).status_code == 400
    assert sql("SELECT COUNT(*) FROM bc.venta")[0][0] == 0


def test_t09_pagos_externos_verificados_y_referencia_unica(cliente_http, cajero):
    yape = cliente_http.post(API, headers=cajero, json=venta([(1, 1)], "YAPE", referencia_externa="YP-123456"))
    tarjeta = cliente_http.post(API, headers=cajero, json=venta([(2, 1)], "TARJETA", referencia_externa="POS-998877",
                                                               modalidad_tarjeta="CREDITO"))
    repetida = cliente_http.post(API, headers=cajero, json=venta([(2, 1)], "YAPE", referencia_externa="YP-123456"))
    assert (yape.status_code, tarjeta.status_code) == (201, 201) and yape.json()["vuelto"] is None
    assert repetida.status_code == 409 and repetida.json()["codigo"] == "REFERENCIA_PAGO_DUPLICADA"


def test_producto_inactivo_o_inexistente_no_se_vende(cliente_http, cajero, propietario):
    cliente_http.delete("/api/v1/productos/2", headers=propietario)
    respuesta = cliente_http.post(API, headers=cajero, json=venta([(2, 1), (999, 1)]))
    assert respuesta.status_code == 422
    assert respuesta.json()["errores"] == [{"producto_id": 2, "motivo": "INACTIVO"},
                                           {"producto_id": 999, "motivo": "INEXISTENTE"}]


def test_venta_con_cliente_registrado(cliente_http, cajero, sql):
    cliente = cliente_http.post("/api/v1/clientes", headers=cajero,
                                json={"tipo_documento": "DNI", "numero_documento": "45879632", "nombre": "Ana Pérez"})
    assert cliente.status_code == 201
    respuesta = cliente_http.post(API, headers=cajero, json={**venta([(1, 1)]), "cliente_id": cliente.json()["cliente_id"]})
    assert respuesta.json()["cliente"] == "Ana Pérez"
    duplicado = cliente_http.post("/api/v1/clientes", headers=cajero,
                                  json={"tipo_documento": "DNI", "numero_documento": "45879632", "nombre": "Otra"})
    assert duplicado.status_code == 409 and duplicado.json()["codigo"] == "CLIENTE_DUPLICADO"


def test_cajero_solo_ve_sus_ventas(cliente_http, cajero, propietario):
    del_propietario = cliente_http.post(API, headers=propietario, json=venta([(1, 1)])).json()["venta_id"]
    assert cliente_http.get(f"{API}/{del_propietario}", headers=cajero).status_code == 404
    assert cliente_http.get(API, headers=cajero).json() == []
    assert len(cliente_http.get(API, headers=propietario).json()) == 1


def test_rnf02_ventas_simultaneas_no_dejan_stock_negativo(cliente_http, sql):
    """10 cajeros intentan llevarse 1 de las 4 bolsas de azúcar a la vez: solo 4 lo logran."""
    token = cliente_http.post("/api/v1/auth/login", json=CAJERO).json()["token"]
    cabeceras = {"Authorization": f"Bearer {token}"}
    with ThreadPoolExecutor(max_workers=5) as hilos:
        estados = list(hilos.map(lambda _: cliente_http.post(API, headers=cabeceras, json=venta([(6, 1)])).status_code,
                                 range(10)))
    assert sorted(estados) == [201] * 4 + [409] * 6
    assert stock(sql, 6) == 0


def test_conciliacion_saldo_igual_a_libro_tras_operaciones(cliente_http, cajero, propietario, sql):
    cliente_http.post(API, headers=cajero, json=venta([(1, 3), (4, 2)]))
    cliente_http.post("/api/v1/inventario/4/mermas", headers=propietario, json={"cantidad": 1, "motivo": "VENCIDO"})
    cliente_http.post("/api/v1/inventario/6/entradas", headers=propietario, json={"cantidad": 10, "referencia": "F001-9"})
    assert sql("SELECT COUNT(*) FROM bc.v_descuadre_inventario")[0][0] == 0
