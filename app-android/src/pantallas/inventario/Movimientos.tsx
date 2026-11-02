/** Prompt 16 · Movimientos de un producto: hechos inmutables con signo y texto (no solo color). */
import { PackageMinus, PackagePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/recursos';
import type { Movimiento } from '../../api/tipos';
import { Aviso, Cargando, ImagenProducto, Selector } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { NOMBRE_MOTIVO, folioVenta, formatoFecha, formatoHora } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const TIPO: Record<Movimiento['tipo'], string> = { ALTA: 'Entrada', ENTRADA: 'Entrada', SALIDA_VENTA: 'Salida', MERMA: 'Merma' };

function descripcion(m: Movimiento) {
  if (m.tipo === 'ALTA') return 'Motivo: Stock inicial';
  if (m.tipo === 'ENTRADA') return `Reposición · ${m.referencia}`;
  if (m.tipo === 'MERMA') return `Merma: ${NOMBRE_MOTIVO[m.motivo_merma!]}${m.referencia ? ` · ${m.referencia}` : ''}`;
  return `Venta ${folioVenta(m.venta_id!)}`;
}

export function Movimientos() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const { state } = useLocation() as { state?: { aviso?: string } };
  const { esPropietario } = useSesion();
  const [dias, setDias] = useState('30');
  const [tipo, setTipo] = useState('TODOS');
  const { datos, error, cargando } = useCarga(() => api.inventario.detalle(id, 200), [id]);

  const visibles = useMemo(() => {
    const limite = dias === 'TODO' ? 0 : Date.now() - Number(dias) * 86_400_000;
    return (datos?.movimientos ?? []).filter((m) => new Date(m.registrada_en).getTime() >= limite
      && (tipo === 'TODOS' || (tipo === 'ENTRADAS' ? m.variacion > 0 : tipo === 'SALIDAS' ? m.tipo === 'SALIDA_VENTA' : m.tipo === 'MERMA')));
  }, [datos, dias, tipo]);

  const p = datos?.producto;
  return (
    <Pantalla titulo="Movimientos de inventario" volver={-1} pie={esPropietario && p?.activo ? (
      <>
        <button className="boton boton--secundario" disabled={!p.stock} onClick={() => navegar(`/inventario/merma?producto=${id}`)}><PackageMinus size={18} />Merma</button>
        <button className="boton" onClick={() => navegar(`/inventario/entrada?producto=${id}`)}><PackagePlus size={18} />Reponer</button>
      </>
    ) : undefined}>
      {state?.aviso && <Aviso tipo="exito">{state.aviso}</Aviso>}
      {cargando ? <Cargando /> : error || !p ? <Aviso tipo="error">{error}</Aviso> : (
        <>
          <div className="tarjeta fila" style={{ gap: 14 }}>
            <ImagenProducto producto={p} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="negrita">{p.nombre}</div>
              <div className="texto-gris" style={{ fontSize: 13.5 }}>Código {p.codigo}</div>
            </div>
            <div className="item__lado">
              <div className="kpi__etiqueta">Stock actual</div>
              <div className={`kpi__valor ${p.por_reponer ? 'kpi__valor--alerta' : 'texto-verde'}`}>{p.stock} und.</div>
            </div>
          </div>
          <div className="reticula-2">
            <Selector etiqueta="Periodo" valor={dias} alCambiar={setDias}
                      opciones={[['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['TODO', 'Todo']]} />
            <Selector etiqueta="Tipo" valor={tipo} alCambiar={setTipo}
                      opciones={[['TODOS', 'Todos'], ['ENTRADAS', 'Entradas'], ['SALIDAS', 'Ventas'], ['MERMAS', 'Mermas']]} />
          </div>
          <section className="lista">
            <h2 className="seccion-titulo">Historial <span className="texto-gris" style={{ fontWeight: 400, fontSize: 13 }}>{visibles.length} movimientos</span></h2>
            {!visibles.length && <div className="vacio">Sin movimientos en este filtro.</div>}
            {visibles.map((m) => (
              <div key={m.movimiento_id} className="item" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 74, flex: 'none' }} className="item__meta">{formatoFecha(m.registrada_en)}<br />{formatoHora(m.registrada_en)}</div>
                <div className="item__cuerpo">
                  <div className="negrita">{TIPO[m.tipo]}</div>
                  <div className="item__meta">{descripcion(m)}</div>
                  {m.venta_id && <Link to={`/historial/${m.venta_id}`} className="texto-verde negrita" style={{ fontSize: 13 }}>Ver venta</Link>}
                </div>
                <div className="item__lado">
                  <div className={`negrita num ${m.variacion > 0 ? 'texto-verde' : 'texto-rojo'}`}>{m.variacion > 0 ? '+' : '−'}{Math.abs(m.variacion)} und.</div>
                  <div className="item__meta">Saldo {m.saldo_reconstruido}</div>
                </div>
              </div>
            ))}
          </section>
          <p className="ayuda centro">Los movimientos registrados no se editan; un error se corrige con un movimiento nuevo.</p>
        </>
      )}
    </Pantalla>
  );
}
