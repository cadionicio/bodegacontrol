/** Formatos en español del Perú y hora de Lima, independientemente de la zona del celular. */
const ZONA = 'America/Lima';
const dinero = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: ZONA });
const hora = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA });
const diaSemana = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' });

export const soles = (monto: number | null | undefined) => (monto == null ? '—' : `S/ ${dinero.format(monto)}`);
export const entero = (n: number) => new Intl.NumberFormat('es-PE').format(n);
export const formatoFecha = (iso: string | number) => fecha.format(new Date(iso)).replace(/\./g, '');
export const formatoHora = (iso: string | number) => hora.format(new Date(iso));
export const formatoFechaHora = (iso: string | number) => `${formatoFecha(iso)} · ${formatoHora(iso)}`;
export const folioVenta = (id: number) => `V-${String(id).padStart(5, '0')}`;
/** "2026-11-02" (fecha calendario) → "Lun". */
export const diaCorto = (isoFecha: string) => {
  const texto = diaSemana.format(new Date(`${isoFecha}T12:00:00Z`)).replace('.', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1, 3);
};
/** Fecha de hoy en Lima en formato AAAA-MM-DD (para filtros de la API). */
export const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
export const redondear = (n: number) => Math.round(n * 100) / 100;

export const NOMBRE_METODO: Record<string, string> = { EFECTIVO: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TARJETA: 'Tarjeta' };
export const nombreMetodo = (metodo: string, modalidad?: string | null) =>
  metodo === 'TARJETA' ? `Visa ${modalidad === 'CREDITO' ? 'crédito' : 'débito'}` : NOMBRE_METODO[metodo] ?? metodo;
export const NOMBRE_MOTIVO: Record<string, string> = { VENCIDO: 'Vencido', DANADO: 'Dañado', FALTANTE: 'Faltante', OTRO: 'Otro' };
