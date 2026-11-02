/** Un método por endpoint propio: las pantallas nunca construyen URLs a mano. */
import { solicitar, urlApi } from './cliente';
import type {
  Cliente, DatosProducto, DetalleInventario, Exportacion, MotivoMerma, Periodo, Producto, ReporteJson,
  ResumenPeriodo, Sesion, Usuario, Venta, VentaResumen, VentaSolicitud,
} from './tipos';

export const api = {
  salud: () => solicitar<{ estado: string }>('GET', '/salud', { tiempo: 8000 }),
  iniciarSesion: (correo: string, contrasena: string) =>
    solicitar<Sesion>('POST', '/auth/login', { cuerpo: { correo, contrasena } }),
  sesion: () => solicitar<Usuario>('GET', '/auth/sesion'),

  productos: {
    listar: (filtros: { buscar?: string; incluir_inactivos?: boolean; por_reponer?: boolean } = {}) =>
      solicitar<Producto[]>('GET', '/productos', { consulta: filtros }),
    obtener: (id: number) => solicitar<Producto>('GET', `/productos/${id}`),
    porCodigoBarras: (codigo: string) =>
      solicitar<Producto>('GET', `/productos/codigo-barras/${encodeURIComponent(codigo)}`),
    crear: (datos: DatosProducto) => solicitar<Producto>('POST', '/productos', { cuerpo: datos }),
    editar: (id: number, cambios: DatosProducto) => solicitar<Producto>('PATCH', `/productos/${id}`, { cuerpo: cambios }),
    desactivar: (id: number) => solicitar<void>('DELETE', `/productos/${id}`),
    subirImagen: (id: number, imagen: Blob) =>
      solicitar<Producto>('PUT', `/productos/${id}/imagen`, { binario: imagen, tiempo: 45_000 }),
    quitarImagen: (id: number) => solicitar<void>('DELETE', `/productos/${id}/imagen`),
    /** URL pública; la versión en la consulta invalida la caché cuando cambia la foto. */
    urlImagen: (producto: Pick<Producto, 'producto_id' | 'imagen_version'>) =>
      producto.imagen_version ? `${urlApi(`/productos/${producto.producto_id}/imagen`)}?v=${producto.imagen_version}` : null,
  },

  inventario: {
    detalle: (id: number, limite = 100) => solicitar<DetalleInventario>('GET', `/inventario/${id}`, { consulta: { limite } }),
    registrarEntrada: (id: number, cantidad: number, referencia: string) =>
      solicitar<DetalleInventario>('POST', `/inventario/${id}/entradas`, { cuerpo: { cantidad, referencia } }),
    registrarMerma: (id: number, cantidad: number, motivo: MotivoMerma, observacion?: string) =>
      solicitar<DetalleInventario>('POST', `/inventario/${id}/mermas`,
        { cuerpo: { cantidad, motivo, ...(observacion ? { observacion } : {}) } }),
  },

  clientes: {
    buscar: (buscar: string) => solicitar<Cliente[]>('GET', '/clientes', { consulta: { buscar, limite: 20 } }),
    crear: (datos: Omit<Cliente, 'cliente_id' | 'activo'>) => solicitar<Cliente>('POST', '/clientes', { cuerpo: datos }),
  },

  ventas: {
    registrar: (venta: VentaSolicitud) => solicitar<Venta>('POST', '/ventas', { cuerpo: venta }),
    /** 200 confirmada · 202 en proceso · 404 no registrada (ErrorApi VENTA_NO_REGISTRADA). */
    estado: (clave: string) => solicitar<Venta | { estado: 'EN_PROCESO'; mensaje: string }>(
      'GET', '/ventas/estado', { consulta: { clave } }),
    listar: (filtros: { desde?: string; hasta?: string; antes_de?: number; limite?: number }) =>
      solicitar<VentaResumen[]>('GET', '/ventas', { consulta: filtros }),
    obtener: (id: number) => solicitar<Venta>('GET', `/ventas/${id}`),
  },

  reportes: {
    resumen: (periodo: Periodo = 'DIARIO') => solicitar<ResumenPeriodo>('GET', '/reportes/resumen', { consulta: { periodo } }),
    vistaPrevia: (tipo: 'ventas' | 'mermas', filtros: FiltrosReporte) =>
      solicitar<ReporteJson>('GET', `/reportes/${tipo}`, { consulta: { ...filtros, formato: 'JSON' } }),
    resumenFiltrado: (filtros: FiltrosReporte) =>
      solicitar<ResumenPeriodo>('GET', '/reportes/resumen', { consulta: { ...filtros } }),
    archivo: (tipo: 'ventas' | 'mermas', formato: 'PDF' | 'CSV', filtros: FiltrosReporte) =>
      solicitar<Blob>('GET', `/reportes/${tipo}`, { consulta: { ...filtros, formato }, comoBlob: true, tiempo: 60_000 }),
    recientes: () => solicitar<Exportacion[]>('GET', '/reportes/exportaciones', { consulta: { limite: 5 } }),
  },
};

export interface FiltrosReporte { periodo: Periodo; fecha?: string; desde?: string; hasta?: string }
