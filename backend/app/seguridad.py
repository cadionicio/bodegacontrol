"""Autenticación JWT y autorización por rol. La identidad nunca la envía el cliente en el cuerpo."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.configuracion import configuracion
from app.errores import ErrorNegocio

PROPIETARIO, CAJERO = "PROPIETARIO", "CAJERO"
_esquema_bearer = HTTPBearer(auto_error=False, description="Token obtenido en POST /api/v1/auth/login")
# Hash de relleno: comparar siempre contra un hash evita revelar por tiempo de respuesta qué correos existen.
_HASH_RELLENO = bcrypt.hashpw(b"relleno", bcrypt.gensalt(12))


@dataclass(frozen=True)
class UsuarioSesion:
    usuario_id: int
    nombre: str
    correo: str
    rol: str


_CONSULTA_USUARIO = """SELECT u.usuario_id, u.nombre, u.correo, u.contrasena_hash, r.codigo AS rol
                       FROM bc.usuario u JOIN bc.rol r USING (rol_id) WHERE u.activo AND {filtro}"""


def autenticar(conexion: Connection, correo: str, contrasena: str) -> dict:
    fila = conexion.execute(_CONSULTA_USUARIO.format(filtro="u.correo = %s"),
                            (correo.strip().lower(),)).fetchone()
    hash_guardado = fila["contrasena_hash"].encode() if fila else _HASH_RELLENO
    if not bcrypt.checkpw(contrasena.encode(), hash_guardado) or not fila:
        raise ErrorNegocio(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos")
    expira = datetime.now(timezone.utc) + timedelta(hours=configuracion.jwt_horas_validez)
    token = jwt.encode({"sub": str(fila["usuario_id"]), "rol": fila["rol"], "exp": expira},
                       configuracion.jwt_secreto, algorithm="HS256")
    return {"token": token, "tipo": "Bearer", "expira_en": expira.isoformat(),
            "usuario": {k: fila[k] for k in ("usuario_id", "nombre", "correo", "rol")}}


def usuario_actual(credenciales: HTTPAuthorizationCredentials | None = Depends(_esquema_bearer),
                   conexion: Connection = Depends(obtener_conexion)) -> UsuarioSesion:
    if credenciales is None:
        raise ErrorNegocio(401, "NO_AUTENTICADO", "Inicie sesión para continuar")
    try:
        datos = jwt.decode(credenciales.credentials, configuracion.jwt_secreto, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ErrorNegocio(401, "SESION_EXPIRADA", "La sesión expiró; vuelva a ingresar", conservar_borrador=True)
    except jwt.InvalidTokenError:
        raise ErrorNegocio(401, "TOKEN_INVALIDO", "Sesión no válida; vuelva a ingresar")
    # Se relee el usuario: una cuenta desactivada pierde acceso aunque su token siga vigente.
    fila = conexion.execute(_CONSULTA_USUARIO.format(filtro="u.usuario_id = %s"), (int(datos["sub"]),)).fetchone()
    if not fila:
        raise ErrorNegocio(401, "USUARIO_INACTIVO", "El usuario ya no tiene acceso")
    return UsuarioSesion(fila["usuario_id"], fila["nombre"], fila["correo"], fila["rol"])


def requerir_propietario(usuario: UsuarioSesion = Depends(usuario_actual)) -> UsuarioSesion:
    if usuario.rol != PROPIETARIO:
        raise ErrorNegocio(403, "SIN_PERMISO", "Esta operación requiere el rol PROPIETARIO")
    return usuario
