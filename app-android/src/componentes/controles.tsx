/** Controles reutilizables: campos con etiqueta visible, avisos, diálogo de confirmación, imagen y gráfico. */
import { CircleAlert, CircleCheck, Info, LoaderCircle, Minus, Package, Plus, TriangleAlert } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { api } from '../api/recursos';
import type { Producto } from '../api/tipos';
import { soles } from '../utilidades/formato';

interface PropiedadesCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: ReactNode;
  error?: string;
  ayuda?: ReactNode;
  icono?: ReactNode;
  /** Elemento dentro del campo, a la derecha (p. ej. mostrar/ocultar contraseña). */
  sufijo?: ReactNode;
  lateral?: ReactNode;
}

/** Etiqueta siempre visible arriba y error debajo del campo afectado, sin borrar lo ingresado. */
export function Campo({ etiqueta, error, ayuda, icono, sufijo, lateral, ...entrada }: PropiedadesCampo) {
  const id = useId();
  return (
    <div className="grupo">
      <label className="etiqueta" htmlFor={id}>{etiqueta}</label>
      <div className="control-fila">
        <div className={`control${error ? ' control--error' : ''}`}>
          {icono}
          <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...entrada} />
          {sufijo}
        </div>
        {lateral}
      </div>
      {error ? <p className="error-campo" id={`${id}-error`}><CircleAlert size={15} />{error}</p>
        : ayuda && <p className="ayuda">{ayuda}</p>}
    </div>
  );
}

export function Selector({ etiqueta, valor, opciones, alCambiar, error }: {
  etiqueta: ReactNode; valor: string; opciones: [string, string][]; alCambiar: (v: string) => void; error?: string;
}) {
  const id = useId();
  return (
    <div className="grupo">
      <label className="etiqueta" htmlFor={id}>{etiqueta}</label>
      <div className={`control${error ? ' control--error' : ''}`}>
        <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)}>
          {opciones.map(([v, texto]) => <option key={v} value={v}>{texto}</option>)}
        </select>
        <span aria-hidden>▾</span>
      </div>
      {error && <p className="error-campo"><CircleAlert size={15} />{error}</p>}
    </div>
  );
}

const ICONO_AVISO = { error: TriangleAlert, exito: CircleCheck, info: Info } as const;

export function Aviso({ tipo = 'info', titulo, children }: { tipo?: keyof typeof ICONO_AVISO; titulo?: string; children?: ReactNode }) {
  const Icono = ICONO_AVISO[tipo];
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono size={20} aria-hidden />
      <div>{titulo && <strong>{titulo}</strong>}{children}</div>
    </div>
  );
}

export const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => (
  <div className="cargando" role="status"><LoaderCircle className="girando" size={28} /><span className="oculto-accesible">{texto}</span></div>
);

/** Confirmación obligatoria para acciones irreversibles o destructivas (desactivar, descartar). */
export function Confirmacion({ titulo, mensaje, textoConfirmar, peligro, alConfirmar, alCancelar }: {
  titulo: string; mensaje: ReactNode; textoConfirmar: string; peligro?: boolean;
  alConfirmar: () => Promise<void> | void; alCancelar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="velo" role="dialog" aria-modal="true" aria-label={titulo} onClick={alCancelar}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        <div className="texto-gris">{mensaje}</div>
        <div className="dialogo__acciones">
          <button className="boton boton--secundario" onClick={alCancelar} disabled={ocupado}>Cancelar</button>
          <button className={`boton ${peligro ? 'boton--peligro-solido' : ''}`} disabled={ocupado}
                  onClick={async () => { setOcupado(true); try { await alConfirmar(); } finally { setOcupado(false); } }}>
            {ocupado && <LoaderCircle className="girando" size={18} />}{textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Foto real del producto (servida por la API) o, si no tiene, un ícono neutro de paquete. */
export function ImagenProducto({ producto, grande }: { producto: Pick<Producto, 'producto_id' | 'imagen_version' | 'nombre'>; grande?: boolean }) {
  const [fallo, setFallo] = useState(false);
  const url = api.productos.urlImagen(producto);
  return (
    <div className={`miniatura${grande ? ' miniatura--grande' : ''}`}>
      {url && !fallo ? <img src={url} alt={producto.nombre} loading="lazy" onError={() => setFallo(true)} />
        : <Package size={grande ? 40 : 26} aria-label="Sin foto" />}
    </div>
  );
}

export function ControlCantidad({ valor, alCambiar }: { valor: number; alCambiar: (n: number) => void }) {
  return (
    <div className="cantidad">
      <button className="boton-icono boton-icono--neutro" aria-label="Restar uno" onClick={() => alCambiar(valor - 1)}><Minus size={18} /></button>
      <output aria-live="polite">{valor}</output>
      <button className="boton-icono boton-icono--neutro" aria-label="Sumar uno" onClick={() => alCambiar(valor + 1)}
              disabled={valor >= 10_000}><Plus size={18} /></button>
    </div>
  );
}

/** Barras simples (sin 3D ni degradados, Prompt maestro). Con muchas barras se espacian las etiquetas. */
export function GraficoBarras({ datos, resaltarUltima = true }: { datos: { clave: string; etiqueta: string; total: number }[]; resaltarUltima?: boolean }) {
  const maximo = Math.max(...datos.map((d) => d.total), 1);
  const ancho = 320, alto = 150, base = 124, paso = ancho / Math.max(datos.length, 1), barra = Math.min(26, paso * 0.7);
  const cadaCuanto = Math.ceil(datos.length / 8);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" role="img"
         aria-label={datos.map((d) => `${d.etiqueta}: ${soles(d.total)}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1="0" x2={ancho} y1={base - f * 104} y2={base - f * 104} stroke="#E4EAE6" strokeWidth="1" />
      ))}
      <line x1="0" x2={ancho} y1={base} y2={base} stroke="#D5DED9" />
      {datos.map((d, i) => {
        const h = Math.max(d.total > 0 ? 3 : 0, (d.total / maximo) * 104);
        const x = i * paso + (paso - barra) / 2;
        return (
          <g key={d.clave}>
            <rect x={x} y={base - h} width={barra} height={h} rx="3" fill={resaltarUltima && i === datos.length - 1 ? '#087744' : '#6FB08F'} />
            {i % cadaCuanto === 0 && <text x={x + barra / 2} y={alto - 8} textAnchor="middle" fontSize="11" fill="#56636B">{d.etiqueta}</text>}
          </g>
        );
      })}
    </svg>
  );
}
