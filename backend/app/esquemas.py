"""Contratos de entrada validados antes de llegar a los servicios (errores → HTTP 400).

extra="forbid": si el celular envía campos que no le corresponden (precio, total, usuario_id, stock),
la solicitud se rechaza en vez de ignorarlos en silencio; así se detectan clientes desalineados.
"""
import re
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Texto = lambda maximo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=maximo)]
CodigoBarras = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9._-]{4,64}$")]
Precio = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Costo = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Cantidad = Annotated[int, Field(gt=0, le=100_000)]
MotivoMerma = Literal["VENCIDO", "DANADO", "FALTANTE", "OTRO"]
MetodoPago = Literal["EFECTIVO", "YAPE", "PLIN", "TARJETA"]
TipoDocumento = Literal["NINGUNO", "DNI", "RUC", "CE"]
TipoComprobante = Literal["BOLETA", "FACTURA", "GUIA", "SIN_COMPROBANTE"]
Periodo = Literal["DIARIO", "SEMANAL", "MENSUAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL",
                  "TODO", "PERSONALIZADO"]

# Misma regla que ck_cliente_documento: se valida aquí para devolver un mensaje claro por campo.
_PATRON_DOCUMENTO = {"DNI": r"^[0-9]{8}$", "RUC": r"^(10|15|17|20)[0-9]{9}$", "CE": r"^[A-Za-z0-9]{4,24}$"}


class Entrada(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credenciales(Entrada):
    correo: Texto(160)
    contrasena: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ProductoCrear(Entrada):
    """Sin código: la BD asigna el correlativo (P0009…). Enviarlo se rechaza por extra="forbid"."""
    nombre: Texto(120)
    precio: Precio
    costo: Costo | None = None
    stock_minimo: Annotated[int, Field(ge=0, le=100_000)] = 0
    stock_inicial: Annotated[int, Field(ge=0, le=100_000)] = 0
    codigo_barras: CodigoBarras | None = None


class ProductoEditar(Entrada):
    """Sin stock (cambia solo con movimientos) ni código (identificador asignado por el sistema)."""
    nombre: Texto(120) | None = None
    precio: Precio | None = None
    costo: Costo | None = None
    stock_minimo: Annotated[int, Field(ge=0, le=100_000)] | None = None
    codigo_barras: CodigoBarras | None = None
    activo: bool | None = None

    @model_validator(mode="after")
    def _no_vacio(self):
        if not self.model_fields_set:
            raise ValueError("Envíe al menos un campo para modificar")
        # Estos campos son obligatorios en la BD: enviarlos como null no tiene sentido.
        nulos = [c for c in ("nombre", "precio", "stock_minimo", "activo")
                 if c in self.model_fields_set and getattr(self, c) is None]
        if nulos:
            raise ValueError(f"No pueden ser nulos: {', '.join(nulos)}")
        return self


class EntradaInventario(Entrada):
    """El N.º de entrada (E-00001) lo asigna la BD; el número del comprobante del proveedor es opcional."""
    cantidad: Cantidad
    tipo_comprobante: TipoComprobante
    numero_comprobante: Texto(120) | None = None

    @model_validator(mode="after")
    def _sin_numero_si_no_hay_comprobante(self):
        if self.tipo_comprobante == "SIN_COMPROBANTE" and self.numero_comprobante:
            raise ValueError("Sin comprobante no debe enviarse número de comprobante")
        return self


class MermaInventario(Entrada):
    cantidad: Cantidad
    motivo: MotivoMerma
    observacion: Texto(120) | None = None

    @model_validator(mode="after")
    def _observacion_si_otro(self):
        if self.motivo == "OTRO" and not self.observacion:
            raise ValueError("La observación es obligatoria cuando el motivo es OTRO")
        return self


class ClienteCrear(Entrada):
    tipo_documento: TipoDocumento = "NINGUNO"
    numero_documento: Annotated[str, StringConstraints(strip_whitespace=True)] | None = None
    nombre: Texto(140)
    telefono: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9]{6,14}$")] | None = None

    @model_validator(mode="after")
    def _documento_coherente(self):
        patron = _PATRON_DOCUMENTO.get(self.tipo_documento)
        if patron is None and self.numero_documento:
            raise ValueError("Sin tipo de documento no debe enviarse número")
        if patron and not re.fullmatch(patron, self.numero_documento or ""):
            raise ValueError(f"Número de {self.tipo_documento} inválido")
        return self


class LineaVenta(Entrada):
    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0, le=10_000)]


class PagoVenta(Entrada):
    metodo: MetodoPago
    modalidad_tarjeta: Literal["DEBITO", "CREDITO"] | None = None
    importe_recibido: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)] | None = None
    referencia_externa: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=80)] | None = None

    @model_validator(mode="after")
    def _evidencia_segun_metodo(self):
        efectivo = self.metodo == "EFECTIVO"
        if efectivo and (self.importe_recibido is None or self.referencia_externa):
            raise ValueError("Efectivo requiere importe_recibido y no lleva referencia")
        if not efectivo and (not self.referencia_externa or self.importe_recibido is not None):
            raise ValueError(f"{self.metodo} requiere referencia_externa verificada y no lleva importe_recibido")
        if (self.metodo == "TARJETA") != (self.modalidad_tarjeta is not None):
            raise ValueError("modalidad_tarjeta es obligatoria solo para TARJETA")
        return self


class VentaCrear(Entrada):
    """Sin precios ni totales: el servidor los obtiene del catálogo (RN-04)."""
    clave_idempotencia: UUID
    cliente_id: Annotated[int, Field(gt=0)] | None = None
    lineas: Annotated[list[LineaVenta], Field(min_length=1, max_length=50)]
    pago: PagoVenta

    @model_validator(mode="after")
    def _sin_productos_repetidos(self):
        ids = [linea.producto_id for linea in self.lineas]
        if len(ids) != len(set(ids)):
            raise ValueError("Un producto solo puede aparecer en una línea; sume las cantidades")
        return self
