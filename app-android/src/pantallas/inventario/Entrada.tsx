/**
 * Prompt 22 · Registrar entrada (reposición). El sistema asigna el N.º de entrada correlativo (E-00001);
 * el usuario indica el tipo de comprobante del proveedor y, si lo tiene, su número.
 */
import { CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import type { TipoComprobante } from '../../api/tipos';
import { Aviso, Campo, Cargando, Selector } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { NOMBRE_COMPROBANTE } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const TIPOS: TipoComprobante[] = ['BOLETA', 'FACTURA', 'GUIA', 'SIN_COMPROBANTE'];

export function RegistrarEntrada() {
  const navegar = useNavigate();
  const [consulta] = useSearchParams();
  const { datos: productos, cargando } = useCarga(() => api.productos.listar(), []);
  const [productoId, setProductoId] = useState(consulta.get('producto') ?? '');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState<TipoComprobante | null>(null);
  const [numero, setNumero] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const elegido = productos?.find((p) => String(p.producto_id) === productoId);
  const limpiar = (campo: string) => setErrores({ ...errores, [campo]: '' });

  const registrar = async () => {
    const e: Record<string, string> = {};
    if (!elegido) e.producto = 'Seleccione un producto';
    if (!/^\d+$/.test(cantidad) || Number(cantidad) < 1 || Number(cantidad) > 100_000) e.cantidad = 'Cantidad entera mayor a 0';
    if (!tipo) e.tipo = 'Elija el tipo de comprobante';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setGeneral(null);
    try {
      const resultado = await api.inventario.registrarEntrada(elegido!.producto_id, Number(cantidad), tipo!,
        tipo === 'SIN_COMPROBANTE' ? undefined : numero.trim() || undefined);
      navegar(`/inventario/${elegido!.producto_id}`, { replace: true, state: {
        aviso: `Entrada ${resultado.movimiento.numero_entrada} registrada: +${cantidad} und. Stock actual ${resultado.producto.stock} und.` } });
    } catch (falla) {
      if (falla instanceof ErrorApi && falla.codigo === 'PRODUCTO_INACTIVO') setErrores({ producto: falla.message });
      else setGeneral(mensajeDeError(falla));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla titulo="Registrar entrada" volver={-1} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" disabled={enviando} onClick={registrar}>
          {enviando && <LoaderCircle className="girando" size={18} />}Validar y registrar
        </button>
      </>
    }>
      <Encabezado titulo="Registrar entrada" subtitulo="Reposición de mercadería" />
      {general && <Aviso tipo="error">{general}</Aviso>}
      {cargando ? <Cargando /> : (
        <>
          <Selector etiqueta="Producto" valor={productoId} alCambiar={(v) => { setProductoId(v); limpiar('producto'); }} error={errores.producto}
                    opciones={[['', 'Seleccione…'], ...(productos ?? []).map((p): [string, string] => [String(p.producto_id), `${p.nombre} · ${p.codigo}`])]} />
          {elegido && <p className="ayuda" style={{ marginTop: -8 }}>Stock actual: {elegido.stock} und. · mínimo {elegido.stock_minimo} und.</p>}
          <Campo etiqueta="Cantidad de entrada" inputMode="numeric" value={cantidad} error={errores.cantidad} placeholder="0"
                 onChange={(e) => { setCantidad(e.target.value.replace(/\D/g, '')); limpiar('cantidad'); }} />
          <div className="grupo">
            <span className="etiqueta">Tipo de comprobante</span>
            <div className="reticula-2" role="radiogroup" aria-label="Tipo de comprobante">
              {TIPOS.map((t) => (
                <button key={t} role="radio" aria-checked={tipo === t} className={`opcion-pago${tipo === t ? ' opcion-pago--activa' : ''}`}
                        onClick={() => { setTipo(t); limpiar('tipo'); if (t === 'SIN_COMPROBANTE') setNumero(''); }}>{NOMBRE_COMPROBANTE[t]}</button>
              ))}
            </div>
            {errores.tipo && <p className="error-campo"><CircleAlert size={15} />{errores.tipo}</p>}
          </div>
          {tipo && tipo !== 'SIN_COMPROBANTE' && (
            <Campo etiqueta={<>N.º de {NOMBRE_COMPROBANTE[tipo].toLowerCase()} <small>(opcional)</small></>} value={numero} maxLength={120}
                   placeholder={tipo === 'FACTURA' ? 'F001-123' : tipo === 'BOLETA' ? 'B001-456' : 'T001-789'}
                   ayuda="Número impreso en el documento del proveedor" onChange={(e) => setNumero(e.target.value)} />
          )}
          <div className="aviso"><Info size={20} color="var(--gris-texto)" />
            <div>El sistema asignará el N.º de entrada (E-00001, E-00002…) y actualizará el stock con un movimiento trazable.</div></div>
        </>
      )}
    </Pantalla>
  );
}
