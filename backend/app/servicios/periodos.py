"""Traduce periodos de negocio a intervalos [desde, hasta) en el calendario de Lima (RN-08, RF-17).

Los límites se calculan en hora local y se convierten a instantes absolutos: así "noviembre" incluye
la venta de las 23:59 del 30/11 en Lima aunque en UTC ya sea 1 de diciembre.
"""
from datetime import date, datetime, time, timedelta

from app.configuracion import configuracion
from app.errores import ErrorNegocio

_MESES_POR_PERIODO = {"MENSUAL": 1, "BIMESTRAL": 2, "TRIMESTRAL": 3, "SEMESTRAL": 6, "ANUAL": 12}
_INICIO_HISTORICO = date(2000, 1, 1)


def _instante(dia: date) -> datetime:
    return datetime.combine(dia, time.min, tzinfo=configuracion.zona_horaria)


def _sumar_meses(dia: date, meses: int) -> date:
    indice = dia.month - 1 + meses
    return date(dia.year + indice // 12, indice % 12 + 1, 1)


def hoy_local() -> date:
    return datetime.now(configuracion.zona_horaria).date()


def intervalo(periodo: str, fecha: date | None = None, desde: date | None = None,
              hasta: date | None = None) -> tuple[datetime, datetime]:
    """`fecha` es cualquier día dentro del periodo (por defecto hoy). Los bloques bimestrales, trimestrales
    y semestrales son de calendario (ene-feb, ene-mar, ene-jun), no móviles, para que sean comparables."""
    referencia = fecha or hoy_local()
    if periodo == "PERSONALIZADO":
        if not desde or not hasta or desde > hasta:
            raise ErrorNegocio(400, "FECHAS_INVALIDAS", "Indique desde y hasta, con desde ≤ hasta",
                               [{"campo": "desde"}, {"campo": "hasta"}], conservar_borrador=True)
        inicio, fin = desde, hasta + timedelta(days=1)  # 'hasta' lo elige el usuario como día incluido
    elif periodo == "TODO":
        inicio, fin = _INICIO_HISTORICO, hoy_local() + timedelta(days=1)
    elif periodo == "DIARIO":
        inicio, fin = referencia, referencia + timedelta(days=1)
    elif periodo == "SEMANAL":  # semana de lunes a domingo
        inicio = referencia - timedelta(days=referencia.weekday())
        fin = inicio + timedelta(days=7)
    else:
        meses = _MESES_POR_PERIODO[periodo]
        inicio = date(referencia.year, (referencia.month - 1) // meses * meses + 1, 1)
        fin = _sumar_meses(inicio, meses)
    return _instante(inicio), _instante(fin)


def intervalo_de_fechas(desde: date | None, hasta: date | None) -> tuple[datetime | None, datetime | None]:
    """Filtro opcional del historial: cualquiera de los dos extremos puede omitirse."""
    if desde and hasta and desde > hasta:
        raise ErrorNegocio(400, "FECHAS_INVALIDAS", "desde debe ser anterior o igual a hasta")
    return (_instante(desde) if desde else None), (_instante(hasta + timedelta(days=1)) if hasta else None)
