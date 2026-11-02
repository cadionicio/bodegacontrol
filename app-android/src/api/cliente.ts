/**
 * Cliente HTTP único: agrega el token, aplica tiempo límite y traduce fallos a dos tipos de error
 * que las pantallas tratan distinto: ErrorApi (el servidor respondió) y ErrorConexion (no hubo respuesta).
 */
import { TIEMPO_ESPERA_MS } from '../configuracion';

export interface DetalleError { campo?: string; producto_id?: number; [clave: string]: unknown }

export class ErrorApi extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string,
              public errores: DetalleError[] = [], public conservarBorrador = false) {
    super(mensaje);
  }
  /** Error asociado a un campo de formulario (contrato {campo, detalle} de la API). */
  errorDeCampo(campo: string): string | undefined {
    const error = this.errores.find((e) => e.campo === campo);
    return error ? String(error.detalle ?? this.message) : undefined;
  }
}

/** Sin respuesta del servidor. En una escritura no se sabe si se aplicó: hay que consultar antes de reintentar. */
export class ErrorConexion extends Error {
  constructor(public porTiempo: boolean) {
    super(porTiempo ? 'El servidor tardó demasiado en responder' : 'No hay conexión con el servidor');
  }
}

interface Configuracion { urlBase: string; token: string | null; alPerderSesion: () => void }
const configuracion: Configuracion = { urlBase: '', token: null, alPerderSesion: () => undefined };

export function configurarCliente(cambios: Partial<Configuracion>) {
  Object.assign(configuracion, cambios);
}

export const urlApi = (ruta: string) => `${configuracion.urlBase.replace(/\/+$/, '')}/api/v1${ruta}`;

type Consulta = Record<string, string | number | boolean | null | undefined>;
interface Opciones { cuerpo?: unknown; binario?: Blob; consulta?: Consulta; comoBlob?: boolean; tiempo?: number }

const SESION_INVALIDA = new Set(['SESION_EXPIRADA', 'TOKEN_INVALIDO', 'USUARIO_INACTIVO', 'NO_AUTENTICADO']);

export async function solicitar<T>(metodo: string, ruta: string, opciones: Opciones = {}): Promise<T> {
  const parametros = new URLSearchParams(
    Object.entries(opciones.consulta ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]));
  const textoConsulta = parametros.toString();
  const url = urlApi(ruta) + (textoConsulta ? `?${textoConsulta}` : '');
  const cabeceras: Record<string, string> = {};
  if (configuracion.token) cabeceras.Authorization = `Bearer ${configuracion.token}`;
  let cuerpo: BodyInit | undefined;
  if (opciones.binario) { cuerpo = opciones.binario; cabeceras['Content-Type'] = opciones.binario.type; }
  else if (opciones.cuerpo !== undefined) { cuerpo = JSON.stringify(opciones.cuerpo); cabeceras['Content-Type'] = 'application/json'; }

  const cancelador = new AbortController();
  const temporizador = setTimeout(() => cancelador.abort(), opciones.tiempo ?? TIEMPO_ESPERA_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo, signal: cancelador.signal });
  } catch {
    throw new ErrorConexion(cancelador.signal.aborted);
  } finally {
    clearTimeout(temporizador);
  }

  if (respuesta.ok) {
    if (respuesta.status === 204) return undefined as T;
    return (opciones.comoBlob ? respuesta.blob() : respuesta.json()) as Promise<T>;
  }
  const datos = await respuesta.json().catch(() => ({}));
  const error = new ErrorApi(respuesta.status, datos.codigo ?? 'ERROR_DESCONOCIDO',
    datos.mensaje ?? `El servidor respondió ${respuesta.status}`, datos.errores ?? [], datos.conservar_borrador ?? false);
  // La sesión caducada lleva al Login, pero el borrador de venta queda guardado en el celular.
  if (respuesta.status === 401 && SESION_INVALIDA.has(error.codigo) && configuracion.token) configuracion.alPerderSesion();
  throw error;
}

/** Mensaje legible para cualquier error, sin exponer detalles técnicos. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi || error instanceof ErrorConexion) return error.message;
  return 'Ocurrió un problema inesperado. Intente nuevamente.';
}
