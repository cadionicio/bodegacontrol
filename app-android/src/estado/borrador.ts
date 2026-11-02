/**
 * Borrador de venta (RF-08, HU-04): vive solo en el celular y se guarda en cada cambio, así un cierre
 * inesperado o un rechazo del servidor no obliga a rehacer el carrito. No descuenta stock ni registra nada.
 * Una venta pausada vence a las 2 horas: un cliente que vuelve otro día empieza una venta nueva.
 */
import { useSyncExternalStore } from 'react';
import type { MetodoPago, Modalidad, Producto } from '../api/tipos';
import { VENCIMIENTO_BORRADOR_MS } from '../configuracion';
import { borrar, guardar, leer } from '../utilidades/almacen';
import { redondear } from '../utilidades/formato';

export interface LineaBorrador {
  producto_id: number; codigo: string; nombre: string; precio: number; stock: number; cantidad: number;
  imagen_version: number | null;
}
export interface PagoBorrador {
  metodo: MetodoPago; modalidad?: Modalidad; importe?: string; referencia?: string; verificado?: boolean;
}
export interface Borrador {
  cliente: { cliente_id: number; nombre: string } | null;
  lineas: LineaBorrador[];
  pago: PagoBorrador | null;
  /** Clave idempotente de ESTE contenido: se conserva entre reintentos y se renueva si el carrito cambia. */
  clave: string | null;
  actualizado_en: number;
  pausado: boolean;
  /** Mensajes del servidor por producto (p. ej. stock insuficiente) para resaltar solo esas líneas. */
  errores: Record<number, string>;
}

/** Respaldo de crypto.randomUUID para WebViews antiguos: UUID v4 con aleatoriedad criptográfica. */
const uuidV4 = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
  (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

const vacio = (): Borrador => ({ cliente: null, lineas: [], pago: null, clave: null, actualizado_en: Date.now(), pausado: false, errores: {} });

let actual: Borrador = vacio();
let claveAlmacen: string | null = null;
const oyentes = new Set<() => void>();

const vencido = (b: Borrador) => b.lineas.length > 0 && Date.now() - b.actualizado_en > VENCIMIENTO_BORRADOR_MS;

function publicar(siguiente: Borrador) {
  actual = siguiente;
  oyentes.forEach((oyente) => oyente());
  if (!claveAlmacen) return;
  void (siguiente.lineas.length || siguiente.cliente ? guardar(claveAlmacen, siguiente) : borrar(claveAlmacen));
}

/** Cambios de contenido: invalidan la clave idempotente y la verificación de un pago electrónico. */
function modificar(cambio: (b: Borrador) => Partial<Borrador>) {
  const parcial = cambio(actual);
  const pago = actual.pago && parcial.lineas ? { ...actual.pago, verificado: false } : actual.pago;
  publicar({ ...actual, pago, ...parcial, clave: null, actualizado_en: Date.now(), pausado: false });
}

/** Cada usuario tiene su propio borrador: otro usuario en el mismo celular no ve la venta ajena. */
export async function cargarBorrador(usuarioId: number) {
  claveAlmacen = `borrador:${usuarioId}`;
  const guardado = await leer<Borrador>(claveAlmacen);
  publicar(guardado && !vencido(guardado) ? guardado : vacio());
}

export const totalBorrador = (b: Borrador) => redondear(b.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0));
export const unidadesBorrador = (b: Borrador) => b.lineas.reduce((s, l) => s + l.cantidad, 0);
export const minutosRestantes = (b: Borrador) =>
  Math.max(0, Math.ceil((b.actualizado_en + VENCIMIENTO_BORRADOR_MS - Date.now()) / 60_000));
/** «1 h 40 min», «2 h» o «25 min». */
export const tiempoRestante = (b: Borrador) => {
  const minutos = minutosRestantes(b), horas = Math.floor(minutos / 60), resto = minutos % 60;
  return horas ? `${horas} h${resto ? ` ${resto} min` : ''}` : `${resto} min`;
};

export const borrador = {
  agregar(producto: Producto, cantidad = 1) {
    modificar((b) => {
      const existe = b.lineas.find((l) => l.producto_id === producto.producto_id);
      const lineas = existe
        ? b.lineas.map((l) => (l === existe ? { ...l, cantidad: l.cantidad + cantidad } : l))
        : [...b.lineas, { producto_id: producto.producto_id, codigo: producto.codigo, nombre: producto.nombre,
            precio: producto.precio, stock: producto.stock, cantidad, imagen_version: producto.imagen_version }];
      return { lineas };
    });
  },
  cambiarCantidad(productoId: number, cantidad: number) {
    modificar((b) => ({
      lineas: cantidad <= 0 ? b.lineas.filter((l) => l.producto_id !== productoId)
        : b.lineas.map((l) => (l.producto_id === productoId ? { ...l, cantidad } : l)),
      errores: Object.fromEntries(Object.entries(b.errores).filter(([id]) => Number(id) !== productoId)),
    }));
  },
  fijarCliente(cliente: Borrador['cliente']) { modificar(() => ({ cliente })); },
  fijarPago(pago: PagoBorrador) { modificar(() => ({ pago })); },
  /** Refresca precio y stock con el catálogo actual al retomar una venta (el servidor revalida igual). */
  actualizarCatalogo(productos: Producto[]) {
    const porId = new Map(productos.map((p) => [p.producto_id, p]));
    publicar({ ...actual, lineas: actual.lineas.map((l) => {
      const p = porId.get(l.producto_id);
      return p ? { ...l, precio: p.precio, stock: p.stock, nombre: p.nombre, imagen_version: p.imagen_version } : l;
    }), clave: null });
  },
  marcarErrores(errores: Record<number, string>) { publicar({ ...actual, errores }); },
  /** Genera la clave una sola vez por contenido: un reintento tras timeout reutiliza la misma. */
  asegurarClave(): string {
    if (actual.clave) return actual.clave;
    const clave = crypto.randomUUID?.() ?? uuidV4();
    publicar({ ...actual, clave });
    return clave;
  },
  pausar() { publicar({ ...actual, pausado: true, actualizado_en: Date.now() }); },
  descartar() { publicar(vacio()); },
};

const suscribir = (oyente: () => void) => { oyentes.add(oyente); return () => oyentes.delete(oyente); };
const obtener = () => actual;

export function useBorrador(): Borrador {
  const b = useSyncExternalStore(suscribir, obtener);
  return vencido(b) ? vacio() : b;
}
