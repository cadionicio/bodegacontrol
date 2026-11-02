/** Contratos de la API REST de BodegaControl (/api/v1). */
export type Rol = 'PROPIETARIO' | 'CAJERO';
export type MetodoPago = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA';
export type Modalidad = 'DEBITO' | 'CREDITO';
export type MotivoMerma = 'VENCIDO' | 'DANADO' | 'FALTANTE' | 'OTRO';
export type TipoMovimiento = 'ALTA' | 'ENTRADA' | 'SALIDA_VENTA' | 'MERMA';
export type TipoComprobante = 'BOLETA' | 'FACTURA' | 'GUIA' | 'SIN_COMPROBANTE';
export type Periodo = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'TODO' | 'PERSONALIZADO';

export interface Usuario { usuario_id: number; nombre: string; correo: string; rol: Rol }
export interface Sesion { token: string; usuario: Usuario }

export interface Producto {
  producto_id: number; codigo: string; codigo_barras: string | null; nombre: string; precio: number;
  costo?: number | null; stock_minimo: number; activo: boolean; stock: number; stock_actualizado_en: string;
  por_reponer: boolean; actualizado_en: string; imagen_version: number | null;
}
export interface DatosProducto {
  nombre?: string; precio?: number; costo?: number | null; stock_minimo?: number;
  stock_inicial?: number; codigo_barras?: string | null; activo?: boolean;
}

export interface Movimiento {
  movimiento_id: number; registrada_en: string; tipo: TipoMovimiento; motivo_merma: MotivoMerma | null;
  cantidad: number; variacion: number; saldo_reconstruido: number; operador: string; venta_id: number | null;
  numero_entrada: string | null; tipo_comprobante: TipoComprobante | null; referencia: string | null;
}
export interface DetalleInventarioConMovimiento extends DetalleInventario { movimiento: { numero_entrada: string | null } }
export interface DetalleInventario { producto: Producto; movimientos: Movimiento[] }

export interface Cliente {
  cliente_id: number; tipo_documento: 'NINGUNO' | 'DNI' | 'RUC' | 'CE'; numero_documento: string | null;
  nombre: string; telefono: string | null; activo: boolean;
}

export interface PagoSolicitud {
  metodo: MetodoPago; modalidad_tarjeta?: Modalidad; importe_recibido?: number; referencia_externa?: string;
}
export interface VentaSolicitud {
  clave_idempotencia: string; cliente_id: number | null;
  lineas: { producto_id: number; cantidad: number }[]; pago: PagoSolicitud;
}
export interface VentaResumen {
  venta_id: number; registrada_en: string; usuario_id: number; cajero: string; cliente_id: number | null;
  cliente: string | null; lineas: number; unidades: number; total: number; costo_total: number | null;
  ganancia: number | null; metodo: MetodoPago; modalidad_tarjeta: Modalidad | null; importe_recibido: number | null;
  vuelto: number | null; referencia_externa: string | null;
}
export interface LineaVendida {
  producto_id: number; codigo: string; nombre: string; cantidad: number; precio_unitario: number;
  importe: number; ganancia: number | null; movimiento_id: number | null;
}
export interface Venta extends VentaResumen { estado: 'CONFIRMADA'; repetida: boolean; detalle: LineaVendida[] }

export interface ResumenPeriodo {
  intervalo: { periodo: Periodo; desde: string; hasta_exclusivo: string; etiqueta: string };
  ventas: { ventas: number; total: number; unidades: number; ticket_promedio: number; ganancia_conocida: number; ventas_sin_costo: number };
  por_metodo: { metodo: MetodoPago; ventas: number; total: number }[];
  mas_vendidos: { producto_id: number; codigo: string; nombre: string; unidades: number; total: number }[];
  mermas: { unidades: number; valor_perdido: number; porcentaje_merma: number | null;
            por_motivo: { motivo: MotivoMerma; unidades: number; valor_perdido: number }[] };
  catalogo: { productos_activos: number; por_reponer: number; unidades: number };
  ultimos_7_dias: { fecha: string; ventas: number; total: number }[];
}
export interface ReporteJson {
  intervalo: ResumenPeriodo['intervalo'];
  resumen: ResumenPeriodo['ventas'] | ResumenPeriodo['mermas'];
  filas: Record<string, string | number | null>[];
}
export interface Exportacion {
  exportacion_id: number; tipo_reporte: 'VENTAS' | 'MERMAS'; formato: 'PDF' | 'CSV'; periodo: Periodo;
  desde: string; hasta_exclusivo: string; cantidad_filas: number; generado_en: string; generado_por: string;
}
