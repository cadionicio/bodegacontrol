"""Autenticación, autorización por rol (T-07) y manejo de solicitudes inválidas."""
from conftest import CAJERO

API = "/api/v1"


def test_salud_confirma_conexion_a_postgresql(cliente_http):
    respuesta = cliente_http.get(f"{API}/salud")
    assert respuesta.status_code == 200 and respuesta.json()["estado"] == "OK"


def test_login_correcto_devuelve_token_y_rol(cliente_http):
    cuerpo = cliente_http.post(f"{API}/auth/login", json=CAJERO).json()
    assert cuerpo["token"] and cuerpo["usuario"]["rol"] == "CAJERO"


def test_login_con_contrasena_incorrecta_es_401(cliente_http):
    respuesta = cliente_http.post(f"{API}/auth/login", json={**CAJERO, "contrasena": "otra"})
    assert respuesta.status_code == 401 and respuesta.json()["codigo"] == "CREDENCIALES_INVALIDAS"


def test_correo_inexistente_responde_igual_que_contrasena_incorrecta(cliente_http):
    respuesta = cliente_http.post(f"{API}/auth/login", json={"correo": "nadie@x.pe", "contrasena": "x"})
    assert respuesta.status_code == 401 and respuesta.json()["codigo"] == "CREDENCIALES_INVALIDAS"


def test_sin_token_es_401(cliente_http):
    assert cliente_http.get(f"{API}/productos").json()["codigo"] == "NO_AUTENTICADO"


def test_token_alterado_es_401(cliente_http):
    respuesta = cliente_http.get(f"{API}/productos", headers={"Authorization": "Bearer abc.def.ghi"})
    assert respuesta.status_code == 401 and respuesta.json()["codigo"] == "TOKEN_INVALIDO"


def test_usuario_desactivado_pierde_acceso_aunque_su_token_siga_vigente(cliente_http, cajero, sql):
    sql("UPDATE bc.usuario SET activo = FALSE WHERE correo = 'giancarlo@uni.pe'")
    assert cliente_http.get(f"{API}/productos", headers=cajero).json()["codigo"] == "USUARIO_INACTIVO"


def test_t07_cajero_no_puede_exportar_reportes(cliente_http, cajero, sql):
    respuesta = cliente_http.get(f"{API}/reportes/ventas?formato=PDF", headers=cajero)
    assert respuesta.status_code == 403 and respuesta.json()["codigo"] == "SIN_PERMISO"
    assert sql("SELECT COUNT(*) FROM bc.reporte_exportacion")[0][0] == 0  # sin fuga ni auditoría falsa


def test_t07_cajero_no_puede_crear_productos_ni_registrar_mermas(cliente_http, cajero):
    assert cliente_http.post(f"{API}/productos", headers=cajero,
                             json={"codigo": "X01", "nombre": "X", "precio": 1}).status_code == 403
    assert cliente_http.post(f"{API}/inventario/1/mermas", headers=cajero,
                             json={"cantidad": 1, "motivo": "DANADO"}).status_code == 403


def test_cajero_no_recibe_el_costo_de_los_productos(cliente_http, cajero, propietario):
    assert "costo" not in cliente_http.get(f"{API}/productos/1", headers=cajero).json()
    assert cliente_http.get(f"{API}/productos/1", headers=propietario).json()["costo"] == 2.60


def test_json_mal_formado_devuelve_400_con_campos(cliente_http, propietario):
    respuesta = cliente_http.post(f"{API}/productos", headers=propietario, json={"codigo": "a b", "precio": 0})
    cuerpo = respuesta.json()
    assert respuesta.status_code == 400 and cuerpo["codigo"] == "SOLICITUD_INVALIDA"
    assert {"codigo", "nombre", "precio"} <= {error["campo"] for error in cuerpo["errores"]}
