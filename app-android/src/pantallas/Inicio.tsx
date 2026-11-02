/** Prompt 2 · Inicio. Las acciones frecuentes llevan a OPERACIONES; no repiten las pestañas inferiores. */
import { Clock, FileText, ShoppingCart, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/recursos';
import { Aviso, Cargando, GraficoBarras } from '../componentes/controles';
import { Pantalla } from '../componentes/estructura';
import { NOMBRE_NEGOCIO } from '../configuracion';
import { tiempoRestante, totalBorrador, unidadesBorrador, useBorrador } from '../estado/borrador';
import { useSesion, useUsuario } from '../estado/sesion';
import { diaCorto, entero, folioVenta, formatoFecha, formatoHora, hoyLima, soles } from '../utilidades/formato';
import { useCarga } from '../utilidades/useCarga';

function Accion({ icono, texto, a, alerta }: { icono: ReactNode; texto: string; a: string; alerta?: boolean }) {
  return (
    <Link to={a} className="tarjeta centro" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '14px 6px', textDecoration: 'none', color: alerta ? 'var(--rojo)' : 'var(--verde-oscuro)', fontWeight: 600, fontSize: 13.5 }}>
      {icono}{texto}
    </Link>
  );
}

function Kpi({ etiqueta, valor, alerta, chico }: { etiqueta: string; valor: ReactNode; alerta?: boolean; chico?: boolean }) {
  return (
    <div className="tarjeta kpi">
      <div className="kpi__etiqueta">{etiqueta}</div>
      <div className={`kpi__valor${alerta ? ' kpi__valor--alerta' : ''}${chico ? ' kpi__valor--chico' : ''}`}>{valor}</div>
    </div>
  );
}

/** Venta pausada o interrumpida: se retoma sin volver a escanear, hasta que venza. */
function VentaPausada() {
  const b = useBorrador();
  const navegar = useNavigate();
  if (!b.lineas.length) return null;
  return (
    <button className="tarjeta tarjeta--gris tarjeta-boton" onClick={() => navegar('/ventas/pendiente')}>
      <div className="fila entre">
        <span className="fila negrita"><Clock size={18} />Venta pausada</span>
        <span className="texto-verde negrita">Continuar ›</span>
      </div>
      <div className="texto-gris" style={{ fontSize: 13.5, marginTop: 4 }}>
        {unidadesBorrador(b)} unidades · {soles(totalBorrador(b))} · se descarta en {tiempoRestante(b)}
      </div>
    </button>
  );
}

function TableroPropietario() {
  const { datos, error, cargando } = useCarga(() => Promise.all([api.reportes.resumen('DIARIO'), api.ventas.listar({ limite: 2 })]), []);
  if (cargando) return <Cargando />;
  if (error || !datos) return <Aviso tipo="error" titulo="No se pudo cargar el resumen">{error}</Aviso>;
  const [resumen, recientes] = datos;
  return (
    <>
      <div className="reticula-2">
        <Kpi etiqueta="Ventas del día" valor={soles(resumen.ventas.total)} chico />
        <Kpi etiqueta="N.º de ventas" valor={entero(resumen.ventas.ventas)} />
        <Kpi etiqueta="Productos registrados" valor={entero(resumen.catalogo.productos_activos)} />
        <Link to="/inventario?filtro=reponer" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Kpi etiqueta="Por reponer" valor={entero(resumen.catalogo.por_reponer)} alerta={resumen.catalogo.por_reponer > 0} />
        </Link>
      </div>
      <section className="tarjeta">
        <h2 className="tarjeta__titulo">Actividad de ventas <span className="texto-gris" style={{ fontWeight: 400, fontSize: 13 }}>· últimos 7 días</span></h2>
        <GraficoBarras datos={resumen.ultimos_7_dias.map((d) => ({ clave: d.fecha, etiqueta: diaCorto(d.fecha), total: d.total }))} />
      </section>
      <AccionesFrecuentes propietario porReponer={resumen.catalogo.por_reponer} />
      <section className="lista">
        <h2 className="seccion-titulo">Actividad reciente</h2>
        {recientes.length === 0 && <p className="texto-gris">Aún no hay ventas registradas.</p>}
        {recientes.map((v) => (
          <Link key={v.venta_id} to={`/historial/${v.venta_id}`} className="item" style={{ minHeight: 60 }}>
            <div className="item__cuerpo">
              <div className="item__titulo">{folioVenta(v.venta_id)} · {v.cliente ?? 'Cliente general'}</div>
              <div className="item__meta">{formatoFecha(v.registrada_en)} · {formatoHora(v.registrada_en)} · {v.cajero}</div>
            </div>
            <span className="negrita num">{soles(v.total)}</span>
          </Link>
        ))}
      </section>
    </>
  );
}

function TableroCajero() {
  const hoy = hoyLima();
  const { datos, error, cargando } = useCarga(() => Promise.all([
    api.productos.listar({ por_reponer: true }), api.ventas.listar({ desde: hoy, hasta: hoy, limite: 100 })]), [hoy]);
  if (cargando) return <Cargando />;
  if (error || !datos) return <Aviso tipo="error" titulo="No se pudo cargar el inicio">{error}</Aviso>;
  const [porReponer, misVentas] = datos;
  return (
    <>
      <div className="reticula-2">
        <Kpi etiqueta="Mis ventas de hoy" valor={entero(misVentas.length)} />
        <Link to="/inventario?filtro=reponer" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Kpi etiqueta="Por reponer" valor={entero(porReponer.length)} alerta={porReponer.length > 0} />
        </Link>
      </div>
      <AccionesFrecuentes porReponer={porReponer.length} />
      {porReponer.length > 0 && (
        <section className="tarjeta">
          <h2 className="tarjeta__titulo"><TriangleAlert size={18} color="var(--rojo)" />Avisar al propietario</h2>
          {porReponer.slice(0, 4).map((p) => (
            <div key={p.producto_id} className="par"><dt>{p.nombre}</dt><dd className="texto-rojo">{p.stock} und.</dd></div>
          ))}
        </section>
      )}
    </>
  );
}

function AccionesFrecuentes({ propietario, porReponer }: { propietario?: boolean; porReponer: number }) {
  return (
    <section className="lista">
      <h2 className="seccion-titulo">Acciones frecuentes</h2>
      <div className={propietario ? 'reticula-3' : 'reticula-2'}>
        <Accion a="/ventas" texto="Nueva venta" icono={<ShoppingCart size={24} />} />
        {propietario && <Accion a="/reportes" texto="Generar reporte" icono={<FileText size={24} />} />}
        <Accion a="/inventario?filtro=reponer" texto="Alertas de stock" alerta={porReponer > 0} icono={<TriangleAlert size={24} />} />
      </div>
    </section>
  );
}

export function Inicio() {
  const usuario = useUsuario();
  const { esPropietario } = useSesion();
  return (
    <Pantalla>
      <div>
        <h1 className="titulo-pantalla">Hola, {usuario.nombre.split(' ')[0]}</h1>
        <p className="subtitulo-pantalla">{NOMBRE_NEGOCIO} · {formatoFecha(Date.now())}</p>
      </div>
      <VentaPausada />
      {esPropietario ? <TableroPropietario /> : <TableroCajero />}
    </Pantalla>
  );
}
