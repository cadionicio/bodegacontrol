/**
 * Registrar merma (diseño propio con el estilo del Prompt maestro). Motivo obligatorio y observación
 * obligatoria si es «Otro». Muestra la pérdida en soles para que el dueño vea el impacto y la reduzca.
 */
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import type { MotivoMerma } from '../../api/tipos';
import { Aviso, Campo, Cargando, Confirmacion, Selector } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { NOMBRE_MOTIVO, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const MOTIVOS: MotivoMerma[] = ['VENCIDO', 'DANADO', 'FALTANTE', 'OTRO'];

export function RegistrarMerma() {
  const navegar = useNavigate();
  const [consulta] = useSearchParams();
  const { datos: productos, cargando } = useCarga(() => api.productos.listar({ incluir_inactivos: true }), []);
  const [productoId, setProductoId] = useState(consulta.get('producto') ?? '');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState<MotivoMerma | null>(null);
  const [observacion, setObservacion] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const elegido = productos?.find((p) => String(p.producto_id) === productoId);
  const unidades = Number(cantidad) || 0;
  const perdida = elegido?.costo != null ? elegido.costo * unidades : null;

  const validar = () => {
    const e: Record<string, string> = {};
    if (!elegido) e.producto = 'Seleccione un producto';
    if (!/^\d+$/.test(cantidad) || unidades < 1) e.cantidad = 'Cantidad entera mayor a 0';
    else if (elegido && unidades > elegido.stock) e.cantidad = `Solo hay ${elegido.stock} und. en stock`;
    if (!motivo) e.motivo = 'Elija el motivo';
    if (motivo === 'OTRO' && !observacion.trim()) e.observacion = 'Describa el motivo';
    setErrores(e);
    if (!Object.keys(e).length) setConfirmar(true);
  };

  const registrar = async () => {
    try {
      const resultado = await api.inventario.registrarMerma(elegido!.producto_id, unidades, motivo!, observacion.trim() || undefined);
      navegar(`/inventario/${elegido!.producto_id}`, { replace: true,
        state: { aviso: `Merma registrada: −${unidades} und. (${NOMBRE_MOTIVO[motivo!]}). Stock actual ${resultado.producto.stock} und.` } });
    } catch (e) {
      setConfirmar(false);
      if (e instanceof ErrorApi && e.codigo === 'STOCK_INSUFICIENTE') setErrores({ cantidad: `Solo hay ${e.errores[0]?.disponible} und. en stock` });
      else setGeneral(mensajeDeError(e));
    }
  };

  return (
    <Pantalla titulo="Registrar merma" volver={-1} navegacion={false} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" onClick={validar}>Registrar merma</button>
      </>
    }>
      <Encabezado titulo="Registrar merma" subtitulo="Productos vencidos, dañados o faltantes" />
      {general && <Aviso tipo="error">{general}</Aviso>}
      {cargando ? <Cargando /> : (
        <>
          <Selector etiqueta="Producto" valor={productoId} error={errores.producto}
                    alCambiar={(v) => { setProductoId(v); setErrores({ ...errores, producto: '', cantidad: '' }); }}
                    opciones={[['', 'Seleccione…'], ...(productos ?? []).filter((p) => p.stock > 0)
                      .map((p): [string, string] => [String(p.producto_id), `${p.nombre} · ${p.stock} und.`])]} />
          <Campo etiqueta="Cantidad" inputMode="numeric" value={cantidad} error={errores.cantidad} placeholder="0"
                 ayuda={elegido ? `Disponible: ${elegido.stock} und.` : undefined}
                 onChange={(e) => { setCantidad(e.target.value.replace(/\D/g, '')); setErrores({ ...errores, cantidad: '' }); }} />
          <div className="grupo">
            <span className="etiqueta">Motivo</span>
            <div className="reticula-2" role="radiogroup" aria-label="Motivo de la merma">
              {MOTIVOS.map((m) => (
                <button key={m} role="radio" aria-checked={motivo === m} className={`opcion-pago${motivo === m ? ' opcion-pago--activa' : ''}`}
                        onClick={() => { setMotivo(m); setErrores({ ...errores, motivo: '', observacion: '' }); }}>{NOMBRE_MOTIVO[m]}</button>
              ))}
            </div>
            {errores.motivo && <p className="error-campo"><CircleAlert size={15} />{errores.motivo}</p>}
          </div>
          <Campo etiqueta={<>Observación {motivo !== 'OTRO' && <small>(opcional)</small>}</>} value={observacion} maxLength={120}
                 error={errores.observacion} placeholder="Ej. lote vencido 30/10"
                 onChange={(e) => { setObservacion(e.target.value); setErrores({ ...errores, observacion: '' }); }} />
          <div className="tarjeta tarjeta--gris total">
            <span>Pérdida estimada</span>
            <span className="negrita num texto-rojo" style={{ fontSize: 20 }}>{perdida == null ? 'Sin costo registrado' : soles(perdida)}</span>
          </div>
          <p className="ayuda">La merma descuenta stock y queda registrada; no se puede editar. Un error se corrige con una reposición.</p>
        </>
      )}
      {confirmar && elegido && (
        <Confirmacion titulo="¿Registrar la merma?" textoConfirmar="Registrar" peligro alCancelar={() => setConfirmar(false)} alConfirmar={registrar}
                      mensaje={`Se descontarán ${unidades} und. de ${elegido.nombre} por «${NOMBRE_MOTIVO[motivo!]}»${perdida != null ? ` (pérdida ${soles(perdida)})` : ''}.`} />
      )}
    </Pantalla>
  );
}
