/**
 * Prompt 12 · Revisar y cobrar, paso 2 de 3. Los medios electrónicos no se cobran desde la app:
 * el cajero verifica la operación en Yape/Plin/POS y registra su número (RN-06). Nada se guarda aún en el servidor.
 */
import { Banknote, Check, CreditCard, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { MetodoPago, Modalidad } from '../../api/tipos';
import { Campo } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { borrador, totalBorrador, useBorrador, type PagoBorrador } from '../../estado/borrador';
import { redondear, soles } from '../../utilidades/formato';

const OPCIONES: { clave: string; texto: string; metodo: MetodoPago; modalidad?: Modalidad; icono: ReactNode }[] = [
  { clave: 'EFECTIVO', texto: 'Efectivo', metodo: 'EFECTIVO', icono: <Banknote size={22} /> },
  { clave: 'YAPE', texto: 'Yape', metodo: 'YAPE', icono: <Smartphone size={22} /> },
  { clave: 'PLIN', texto: 'Plin', metodo: 'PLIN', icono: <Smartphone size={22} /> },
  { clave: 'DEBITO', texto: 'Visa débito', metodo: 'TARJETA', modalidad: 'DEBITO', icono: <CreditCard size={22} /> },
  { clave: 'CREDITO', texto: 'Visa crédito', metodo: 'TARJETA', modalidad: 'CREDITO', icono: <CreditCard size={22} /> },
];
const claveDe = (p: PagoBorrador | null) => (p ? p.modalidad ?? p.metodo : 'EFECTIVO');

export function ResumenLineas() {
  const b = useBorrador();
  return (
    <section className="tarjeta">
      <h2 className="tarjeta__titulo">Resumen de venta</h2>
      {b.lineas.map((l) => (
        <div key={l.producto_id} className="par"><dt>{l.nombre} ×{l.cantidad}</dt><dd className="num">{soles(l.precio * l.cantidad)}</dd></div>
      ))}
      <hr className="separador" />
      <div className="total"><span className="negrita">Total a cobrar</span><span className="total__monto">{soles(totalBorrador(b))}</span></div>
    </section>
  );
}

export function Cobro() {
  const b = useBorrador();
  const navegar = useNavigate();
  const total = totalBorrador(b);
  const [pago, setPago] = useState<PagoBorrador>(b.pago ?? { metodo: 'EFECTIVO' });
  const [errores, setErrores] = useState<{ importe?: string; referencia?: string; verificado?: string }>({});
  if (!b.lineas.length) return <Navigate to="/ventas" replace />;

  const efectivo = pago.metodo === 'EFECTIVO';
  const importe = Number((pago.importe ?? '').replace(',', '.'));
  const vuelto = efectivo && importe >= total ? redondear(importe - total) : null;
  const actualizar = (cambios: Partial<PagoBorrador>) => { setPago({ ...pago, ...cambios }); setErrores({}); };
  const nombreApp = pago.metodo === 'TARJETA' ? 'el POS' : pago.metodo === 'YAPE' ? 'Yape' : 'Plin';

  const continuar = () => {
    const nuevos: typeof errores = {};
    if (efectivo && !(importe >= total)) nuevos.importe = `Debe ser al menos ${soles(total)}`;
    if (efectivo && importe > 99_999) nuevos.importe = 'Importe fuera de rango';
    if (!efectivo && (pago.referencia ?? '').trim().length < 4) nuevos.referencia = 'Ingrese el número de operación (mínimo 4 caracteres)';
    if (!efectivo && !pago.verificado) nuevos.verificado = `Confirme que verificó el pago en ${nombreApp}`;
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    borrador.fijarPago(efectivo ? { metodo: 'EFECTIVO', importe: importe.toFixed(2) }
      : { metodo: pago.metodo, modalidad: pago.modalidad, referencia: pago.referencia!.trim(), verificado: true });
    navegar('/ventas/confirmar');
  };

  return (
    <Pantalla titulo="Revisar y cobrar" volver="/ventas" pie={
      <>
        <button className="boton boton--secundario" onClick={() => { borrador.fijarPago(pago); navegar('/ventas'); }}>Volver al carrito</button>
        <button className="boton" onClick={continuar}>Continuar</button>
      </>
    }>
      <Encabezado titulo="Revisar y cobrar" subtitulo="Paso 2 de 3 · Pago" />
      <ResumenLineas />

      <section className="grupo">
        <h2 className="seccion-titulo">Método de pago</h2>
        <div className="reticula-2" role="radiogroup" aria-label="Método de pago">
          {OPCIONES.map((o) => {
            const activa = claveDe(pago) === o.clave;
            return (
              <button key={o.clave} role="radio" aria-checked={activa} className={`opcion-pago${activa ? ' opcion-pago--activa' : ''}`}
                      onClick={() => actualizar({ metodo: o.metodo, modalidad: o.modalidad, verificado: false })}>
                {o.icono}{o.texto}{activa && <Check size={20} className="opcion-pago__marca" />}
              </button>
            );
          })}
        </div>
      </section>

      {efectivo ? (
        <>
          <Campo etiqueta="Importe recibido (S/)" inputMode="decimal" placeholder="0.00" value={pago.importe ?? ''}
                 onChange={(e) => actualizar({ importe: e.target.value.replace(/[^0-9.,]/g, '') })} error={errores.importe} />
          <div className="chips">
            {[total, 20, 50, 100].filter((m, i) => i === 0 || m > total).map((m, i) => (
              <button key={m} className="chip" onClick={() => actualizar({ importe: m.toFixed(2) })}>{i === 0 ? 'Exacto' : soles(m)}</button>
            ))}
          </div>
          <div className="tarjeta tarjeta--gris total">
            <span>Vuelto</span><span className="total__monto" style={{ fontSize: 22 }}>{soles(vuelto)}</span>
          </div>
        </>
      ) : (
        <>
          <Campo etiqueta={`N.º de operación ${pago.metodo === 'TARJETA' ? 'del voucher' : `de ${nombreApp}`}`} placeholder="Ej. 48213377"
                 value={pago.referencia ?? ''} maxLength={80} onChange={(e) => actualizar({ referencia: e.target.value })} error={errores.referencia}
                 ayuda={pago.metodo === 'TARJETA' ? 'Número impreso en el voucher del POS. No se piden datos de la tarjeta.'
                   : `Número que aparece en la constancia de ${nombreApp} del cliente. Sirve para comprobar el pago después.`} />
          <label className="casilla">
            <input type="checkbox" checked={!!pago.verificado} onChange={(e) => actualizar({ verificado: e.target.checked })} />
            Verifiqué que el pago de {soles(total)} llegó en {nombreApp}
          </label>
          {errores.verificado && <p className="error-campo">{errores.verificado}</p>}
        </>
      )}
    </Pantalla>
  );
}
