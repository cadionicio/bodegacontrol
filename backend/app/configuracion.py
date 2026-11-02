"""Configuración leída del entorno: el código no contiene secretos ni URLs de servidores."""
import os
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo


def _requerida(nombre: str) -> str:
    valor = os.environ.get(nombre, "").strip()
    if not valor:
        raise RuntimeError(f"Falta la variable de entorno obligatoria {nombre} (ver .env.example)")
    return valor


@dataclass(frozen=True)
class Configuracion:
    url_base_datos: str = field(default_factory=lambda: _requerida("DATABASE_URL"))
    jwt_secreto: str = field(default_factory=lambda: _requerida("JWT_SECRETO"))
    jwt_horas_validez: int = int(os.environ.get("JWT_HORAS_VALIDEZ", "12"))
    # Orígenes de la app Capacitor (Android usa https://localhost) y del servidor de desarrollo Vite.
    origenes_cors: tuple[str, ...] = tuple(
        os.environ.get("ORIGENES_CORS", "https://localhost,http://localhost,capacitor://localhost,"
                                        "http://localhost:5173").split(","))
    tamano_pool: int = int(os.environ.get("TAMANO_POOL", "5"))
    # Los periodos de reporte se calculan en el calendario del negocio, no en UTC del servidor.
    zona_horaria: ZoneInfo = ZoneInfo("America/Lima")


    def __post_init__(self):
        # HS256 con secretos cortos es vulnerable a fuerza bruta (RFC 7518 §3.2).
        if len(self.jwt_secreto) < 32:
            raise RuntimeError("JWT_SECRETO debe tener al menos 32 caracteres")


configuracion = Configuracion()
