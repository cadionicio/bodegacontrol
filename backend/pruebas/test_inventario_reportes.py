"""Reposiciones, mermas y reportes (T-08) contrastados con SQL."""
import csv
import io
import uuid
from datetime import date
from decimal import Decimal

from app.servicios.periodos import intervalo

API = "/api/v1"


def test_reposicion_suma_stock_con_referencia_obligatoria(cliente_http, propietario, sql):
    respuesta = cliente_http.post(f"{API}/inventario/6/entradas", headers=propietario,
                                  json={"cantidad": 10, "referencia": "Factura F001-123"})
    assert respuesta.status_code == 201 and respuesta.json()["producto"]["stock"] == 14
    assert respuesta.json()["producto"]["por_reponer"] is False
    assert sql("SELECT referencia FROM bc.movimiento_inventario WHERE tipo = 'ENTRADA'") == [("Factura F001-123",)]
    sin_referencia = cliente_http.post(f"{API}/inventario/6/entradas", headers=propietario, json={"cantidad": 1})
    assert sin_referencia.status_code == 400


def test_merma_resta_stock_y_congela_el_costo(cliente_http, propietario, sql):
    respuesta = cliente_http.post(f"{API}/inventario/4/mermas", headers=propietario,
                                  json={"cantidad": 3, "motivo": "VENCIDO", "observacion": "Lote 30/10"})
    assert respuesta.status_code == 201 and respuesta.json()["producto"]["stock"] == 49
    assert sql("SELECT motivo_merma, costo_unitario, valor_perdido FROM bc.v_merma") == [
        ("VENCIDO", Decimal("3.90"), Decimal("11.70"))]


def test_merma_mayor_al_stock_es_409(cliente_http, propietario):
    respuesta = cliente_http.post(f"{API}/inventario/6/mermas", headers=propietario, json={"cantidad": 5, "motivo": "DANADO"})
    assert respuesta.status_code == 409 and respuesta.json()["errores"][0]["disponible"] == 4


def test_merma_otro_exige_observacion(cliente_http, propietario):
    assert cliente_http.post(f"{API}/inventario/1/mermas", headers=propietario,
                             json={"cantidad": 1, "motivo": "OTRO"}).status_code == 400


def test_trazabilidad_muestra_saldo_reconstruido(cliente_http, propietario, cajero):
    cliente_http.post(f"{API}/ventas", headers=cajero, json={
        "clave_idempotencia": str(uuid.uuid4()), "lineas": [{"producto_id": 1, "cantidad": 4}],
        "pago": {"metodo": "EFECTIVO", "importe_recibido": 20}})
    movimientos = cliente_http.get(f"{API}/inventario/1", headers=cajero).json()["movimientos"]
    assert [(m["tipo"], m["saldo_reconstruido"]) for m in movimientos] == [("SALIDA_VENTA", 20), ("ALTA", 24)]


def _vender(cliente_http, cabeceras, lineas):
    cliente_http.post(f"{API}/ventas", headers=cabeceras, json={
        "clave_idempotencia": str(uuid.uuid4()), "lineas": [{"producto_id": p, "cantidad": c} for p, c in lineas],
        "pago": {"metodo": "EFECTIVO", "importe_recibido": 200}})


def test_resumen_del_dia_cuadra_con_sql_e_informa_ventas_sin_costo(cliente_http, propietario, cajero, sql):
    _vender(cliente_http, cajero, [(1, 2), (3, 1)])   # ganancia 2.90
    _vender(cliente_http, cajero, [(8, 10)])          # pan sin costo → ganancia desconocida
    cliente_http.post(f"{API}/inventario/4/mermas", headers=propietario, json={"cantidad": 1, "motivo": "DANADO"})
    resumen = cliente_http.get(f"{API}/reportes/resumen", headers=propietario).json()
    total_sql = sql("SELECT SUM(total) FROM bc.v_venta_resumen")[0][0]
    assert resumen["ventas"]["total"] == float(total_sql) == 14.2
    assert (resumen["ventas"]["ganancia_conocida"], resumen["ventas"]["ventas_sin_costo"]) == (2.9, 1)
    assert resumen["mas_vendidos"][0]["codigo"] == "P0008"
    # % merma = 3.90 / (costo vendido 8.30 + 3.90) = 31.97 %
    assert (resumen["mermas"]["valor_perdido"], resumen["mermas"]["porcentaje_merma"]) == (3.9, 31.97)
    assert resumen["catalogo"] == {"productos_activos": 8, "por_reponer": 1, "unidades": 212}  # 226 − 13 vendidas − 1 merma
    serie = resumen["ultimos_7_dias"]
    assert len(serie) == 7 and serie[-1]["total"] == 14.2 and sum(d["ventas"] for d in serie[:-1]) == 0


def test_t08_exportacion_pdf_y_csv_reales_y_auditadas(cliente_http, propietario, sql):
    _vender(cliente_http, propietario, [(1, 2)])
    pdf = cliente_http.get(f"{API}/reportes/ventas", headers=propietario, params={"formato": "PDF"})
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf.headers["content-disposition"]
    texto_csv = cliente_http.get(f"{API}/reportes/ventas", headers=propietario,
                                 params={"formato": "CSV", "periodo": "DIARIO"}).content.decode("utf-8-sig")
    filas = list(csv.DictReader(io.StringIO(texto_csv)))
    assert len(filas) == 1 and Decimal(filas[0]["total"]) == sql("SELECT SUM(total) FROM bc.v_venta_resumen")[0][0]
    assert sql("SELECT formato, periodo, cantidad_filas FROM bc.reporte_exportacion ORDER BY 1") == [
        ("CSV", "DIARIO", 1), ("PDF", "MENSUAL", 1)]


def test_t08_vista_previa_json_no_se_audita_y_personalizado_valida_fechas(cliente_http, propietario, sql):
    assert cliente_http.get(f"{API}/reportes/mermas", headers=propietario).status_code == 200
    invalido = cliente_http.get(f"{API}/reportes/ventas", headers=propietario,
                                params={"periodo": "PERSONALIZADO", "desde": "2026-11-30", "hasta": "2026-11-01"})
    assert invalido.status_code == 400 and invalido.json()["codigo"] == "FECHAS_INVALIDAS"
    assert sql("SELECT COUNT(*) FROM bc.reporte_exportacion")[0][0] == 0


def test_t08_periodos_de_calendario_en_hora_de_lima():
    """Intervalos semiabiertos que cruzan fin de mes/año; 00:00 de Lima = 05:00 UTC."""
    casos = {("DIARIO", date(2026, 11, 30)): ("2026-11-30", "2026-12-01"),
             ("SEMANAL", date(2026, 11, 4)): ("2026-11-02", "2026-11-09"),
             ("MENSUAL", date(2026, 2, 10)): ("2026-02-01", "2026-03-01"),
             ("BIMESTRAL", date(2026, 12, 15)): ("2026-11-01", "2027-01-01"),
             ("TRIMESTRAL", date(2026, 5, 1)): ("2026-04-01", "2026-07-01"),
             ("SEMESTRAL", date(2026, 7, 1)): ("2026-07-01", "2027-01-01"),
             ("ANUAL", date(2026, 6, 6)): ("2026-01-01", "2027-01-01")}
    for (periodo, fecha), (desde, hasta) in casos.items():
        inicio, fin = intervalo(periodo, fecha)
        assert (inicio.date().isoformat(), fin.date().isoformat()) == (desde, hasta), periodo
    assert intervalo("DIARIO", date(2026, 11, 2))[0].utcoffset().total_seconds() == -5 * 3600
