/**
 * Prompts 13, 20 y 21 · Confirmar venta con sus estados: listo → procesando → éxito | rechazo | resultado incierto.
 * Sin respuesta del servidor NO se asume éxito ni fallo: se consulta la clave idempotente antes de reenviar.
 */
import { LoaderCircle, ShieldCheck, WifiOff } from 'lucide-react';
import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ErrorApi, ErrorConexion, mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import type { Venta, VentaSolicitud } from '../../api/tipos';
import { Aviso } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { borrador, totalBorrador, unidadesBorrador, useBorrador, type Borrador } from '../../estado/borrador';
import { nombreMetodo, redondear, soles } from '../../utilidades/formato';

type Estado =
  | { fase: 'listo' } | { fase: 'procesando' } | { fase: 'incierto'; detalle?: string }
  | { fase: 'no_registrada' } | { fase: 'error'; mensaje: string };

const RECHAZOS_POR_LINEA = new Set(['STOCK_INSUFICIENTE', 'PRODUCTO_NO_DISPONIBLE']);

function solicitud(b: Borrador, clave: string): VentaSolicitud {
  const p = b.pago!;
  return {
    clave_idempotencia: clave,
    cliente_id: b.cliente?.cliente_id ?? null,
    lineas: b.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
    pago: p.metodo === 'EFECTIVO' ? { metodo: 'EFECTIVO', importe_recibido: Number(p.importe) }
      : { metodo: p.metodo, referencia_externa: p.referencia, ...(p.metodo === 'TARJETA' ? { modalidad_tarjeta: p.modalidad } : {}) },
  };
}

export function DatosVenta({ b }: { b: Borrador }) {
  const total = totalBorrador(b);
  const p = b.pago!;
  return (
    <dl className="tarjeta" style={{ margin: 0 }}>
      <h2 className="tarjeta__titulo">Datos de la venta</h2>
      <div className="par"><dt>Cliente</dt><dd>{b.cliente?.nombre ?? 'Cliente general'}</dd></div>
      <div className="par"><dt>Unidades</dt><dd>{unidadesBorrador(b)}</dd></div>
      <div className="par"><dt>Método de pago</dt><dd>{nombreMetodo(p.metodo, p.modalidad)}</dd></div>
      <div className="par"><dt>Total</dt><dd className="texto-verde num" style={{ fontSize: 18 }}>{soles(total)}</dd></div>
      {p.metodo === 'EFECTIVO' ? (
        <>
          <div className="par"><dt>Recibido</dt><dd className="num">{soles(Number(p.importe))}</dd></div>
          <div className="par"><dt>Vuelto</dt><dd className="num">{soles(redondear(Number(p.importe) - total))}</dd></div>
        </>
      ) : <div className="par"><dt>Referencia</dt><dd>{p.referencia}</dd></div>}
    </dl>
  );
}

export function Confirmar() {
  const b = useBorrador();
  const navegar = useNavigate();
  const [estado, setEstado] = useState<Estado>({ fase: 'listo' });
  const terminado = useRef(false);

  if (terminado.current) return null; // evita redirigir al carrito vacío mientras se navega al resultado
  if (!b.lineas.length || !b.pago) return <Navigate to="/ventas" replace />;

  const exito = (venta: Venta) => {
    terminado.current = true;
    navegar(`/ventas/resultado/${venta.venta_id}`, { replace: true, state: venta });
    borrador.descartar(); // el borrador solo se limpia tras la confirmación validada del servidor
  };

  const enviar = async () => {
    const clave = borrador.asegurarClave(); // misma clave en cada reintento del mismo contenido
    setEstado({ fase: 'procesando' });
    try {
      exito(await api.ventas.registrar(solicitud(b, clave)));
    } catch (e) {
      if (e instanceof ErrorConexion) return setEstado({ fase: 'incierto' });
      if (e instanceof ErrorApi && RECHAZOS_POR_LINEA.has(e.codigo)) {
        borrador.marcarErrores(Object.fromEntries(e.errores.map((x) => [Number(x.producto_id),
          x.motivo ? `Producto ${x.motivo === 'INACTIVO' ? 'desactivado' : 'inexistente'}` : `Solo hay ${x.disponible} disponibles`])));
        return navegar('/ventas/revisar', { state: { codigo: e.codigo, errores: e.errores } });
      }
      setEstado({ fase: 'error', mensaje: mensajeDeError(e) });
    }
  };

  const comprobar = async () => {
    const clave = b.clave;
    if (!clave) return setEstado({ fase: 'no_registrada' });
    setEstado({ fase: 'procesando' });
    try {
      const respuesta = await api.ventas.estado(clave);
      if ('venta_id' in respuesta) return exito(respuesta);
      setEstado({ fase: 'incierto', detalle: 'La venta aún se está registrando. Vuelva a comprobar en unos segundos.' });
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'VENTA_NO_REGISTRADA') return setEstado({ fase: 'no_registrada' });
      setEstado({ fase: 'incierto', detalle: mensajeDeError(e) });
    }
  };

  const procesando = estado.fase === 'procesando';
  const incierto = estado.fase === 'incierto';
  const pie = incierto ? (
    <>
      <button className="boton boton--secundario" onClick={() => navegar('/ventas')}>Volver al borrador</button>
      <button className="boton" onClick={comprobar}>Comprobar estado</button>
    </>
  ) : (
    <>
      <button className="boton boton--secundario" disabled={procesando} onClick={() => navegar('/ventas/cobro')}>Volver y corregir</button>
      <button className="boton" disabled={procesando} onClick={enviar}>
        {procesando ? <><LoaderCircle className="girando" size={18} />Procesando venta…</>
          : estado.fase === 'no_registrada' ? 'Enviar de nuevo' : 'Confirmar venta'}
      </button>
    </>
  );

  return (
    <Pantalla titulo="Confirmar venta" volver="/ventas/cobro" volverDeshabilitado={procesando} pie={pie}>
      <Encabezado titulo={incierto ? 'Revisar y cobrar' : 'Confirmar venta'}
                  subtitulo={incierto ? 'Resultado pendiente de comprobación' : 'Paso 3 de 3 · Revisa los datos antes del registro'} />
      {incierto && (
        <div className="aviso aviso--error" role="alert">
          <WifiOff size={20} />
          <div><strong>No pudimos confirmar el resultado de esta solicitud</strong>
            Tu carrito está guardado. Primero comprobaremos si la venta se registró.
            {estado.detalle && <p style={{ marginTop: 6 }}>{estado.detalle}</p>}</div>
        </div>
      )}
      {estado.fase === 'no_registrada' && (
        <Aviso tipo="info" titulo="La venta no llegó a registrarse">Puedes enviarla de nuevo: usa la misma clave, así que no se duplicará.</Aviso>
      )}
      {estado.fase === 'error' && <Aviso tipo="error" titulo="No se pudo completar la venta">{estado.mensaje} Tus datos siguen guardados.</Aviso>}

      {incierto ? (
        <details className="tarjeta"><summary className="negrita" style={{ minHeight: 32, cursor: 'pointer' }}>
          Productos y cobro guardados · {soles(totalBorrador(b))}</summary><div style={{ marginTop: 8 }}><DatosVenta b={b} /></div>
        </details>
      ) : <DatosVenta b={b} />}

      {procesando ? (
        <Aviso tipo="info">No cierres la aplicación; estamos comprobando la operación.</Aviso>
      ) : !incierto && (
        <div className="aviso"><ShieldCheck size={20} color="var(--verde)" />
          <div>El sistema validará permisos, precios, existencias y pago antes de confirmar.</div></div>
      )}
    </Pantalla>
  );
}
