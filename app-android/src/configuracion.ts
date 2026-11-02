/** Parámetros de negocio de la app; cambiarlos aquí afecta a todas las pantallas. */
/** Una venta pausada se descarta pasado este tiempo: el cliente que vuelve otro día empieza de nuevo. */
export const VENCIMIENTO_BORRADOR_MS = 2 * 60 * 60 * 1000;
/** Límite de espera de una petición; superado, la venta queda en estado "resultado desconocido". */
export const TIEMPO_ESPERA_MS = 20_000;
export const URL_API_PREDETERMINADA = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://bodegacontrol.vercel.app';
