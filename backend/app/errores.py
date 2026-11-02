"""Contrato único de errores: {codigo, mensaje, errores, conservar_borrador}.

La app Android decide qué hacer leyendo `codigo` (estable), nunca el texto de `mensaje`.
"""
import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

registro = logging.getLogger("bodegacontrol")


class ErrorNegocio(Exception):
    def __init__(self, estado_http: int, codigo: str, mensaje: str,
                 errores: list | None = None, conservar_borrador: bool = False):
        super().__init__(mensaje)
        self.estado_http, self.codigo, self.mensaje = estado_http, codigo, mensaje
        self.errores, self.conservar_borrador = errores or [], conservar_borrador


def no_encontrado(recurso: str) -> ErrorNegocio:
    return ErrorNegocio(404, "NO_ENCONTRADO", f"{recurso} no existe")


# Restricciones de la BD que el usuario puede provocar con datos válidos en forma pero en conflicto.
# Actúan como red de seguridad ante carreras entre solicitudes simultáneas.
_RESTRICCIONES_CONOCIDAS = {
    "producto_codigo_key":         (409, "CODIGO_DUPLICADO", "Ya existe un producto con ese código"),
    "producto_codigo_barras_key":  (409, "CODIGO_BARRAS_DUPLICADO", "Ese código de barras ya está asignado"),
    "uq_cliente_documento":        (409, "CLIENTE_DUPLICADO", "Ya existe un cliente con ese documento"),
    "uq_pago_referencia":          (409, "REFERENCIA_PAGO_DUPLICADA", "Esa operación ya pagó otra venta"),
    "ck_saldo_no_negativo":        (409, "STOCK_INSUFICIENTE", "El stock cambió mientras se procesaba"),
}


def _respuesta(estado: int, codigo: str, mensaje: str, errores=None, conservar_borrador=False):
    return JSONResponse(status_code=estado, content=jsonable_encoder({
        "codigo": codigo, "mensaje": mensaje, "errores": errores or [], "conservar_borrador": conservar_borrador}))


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorNegocio)
    async def _negocio(_: Request, error: ErrorNegocio):
        return _respuesta(error.estado_http, error.codigo, error.mensaje, error.errores, error.conservar_borrador)

    # 400 y no 422: el Plan reserva 422 para reglas de negocio, 400 para solicitudes mal formadas.
    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, error: RequestValidationError):
        campos = [{"campo": ".".join(str(p) for p in e["loc"] if p != "body"), "detalle": e["msg"]}
                  for e in error.errors()]
        return _respuesta(400, "SOLICITUD_INVALIDA", "Revise los campos indicados", campos, True)

    @app.exception_handler(psycopg.Error)
    async def _base_datos(_: Request, error: psycopg.Error):
        restriccion = getattr(error.diag, "constraint_name", None)
        if restriccion in _RESTRICCIONES_CONOCIDAS:
            return _respuesta(*_RESTRICCIONES_CONOCIDAS[restriccion], conservar_borrador=True)
        if error.sqlstate and error.sqlstate.startswith("23"):  # integridad: regla violada
            return _respuesta(422, "REGLA_DE_DATOS", error.diag.message_primary or "Datos rechazados",
                              conservar_borrador=True)
        registro.exception("Error de base de datos no controlado")
        return _respuesta(503 if isinstance(error, psycopg.OperationalError) else 500,
                          "ERROR_SERVIDOR", "No se pudo completar la operación; intente nuevamente",
                          conservar_borrador=True)

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, error: Exception):
        registro.exception("Error no controlado")
        return _respuesta(500, "ERROR_SERVIDOR", "Error interno del servidor", conservar_borrador=True)
