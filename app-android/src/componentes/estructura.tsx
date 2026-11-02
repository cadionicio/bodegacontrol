/** Estructura común de todas las pantallas: cabecera verde, contenido, pie de acciones y navegación inferior. */
import { ArrowLeft, Boxes, House, LogOut, Package, ReceiptText, ShoppingCart, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSesion } from '../estado/sesion';

const DESTINOS = [
  { ruta: '/', texto: 'Inicio', Icono: House },
  { ruta: '/ventas', texto: 'Ventas', Icono: ShoppingCart },
  { ruta: '/productos', texto: 'Productos', Icono: Package },
  { ruta: '/inventario', texto: 'Inventario', Icono: Boxes },
  { ruta: '/historial', texto: 'Historial', Icono: ReceiptText },
] as const;

function NavInferior() {
  return (
    <nav className="nav-inferior" aria-label="Navegación principal">
      {DESTINOS.map(({ ruta, texto, Icono }) => (
        <NavLink key={ruta} to={ruta} end={ruta === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
          <Icono size={24} aria-hidden /> {texto}
        </NavLink>
      ))}
    </nav>
  );
}

interface PropiedadesPantalla {
  children: ReactNode;
  /** Pantallas secundarias muestran flecha «Volver» y su título en la cabecera. */
  titulo?: string;
  volver?: string | number;
  /** Bloquea «Volver» mientras una operación podría duplicarse (p. ej. venta en proceso). */
  volverDeshabilitado?: boolean;
  navegacion?: boolean;
  pie?: ReactNode;
  accion?: ReactNode;
}

export function Pantalla({ children, titulo, volver, volverDeshabilitado, navegacion = true, pie, accion }: PropiedadesPantalla) {
  const navegar = useNavigate();
  const { cerrar } = useSesion();
  const clases = ['pantalla', navegacion && 'con-nav', pie && 'con-pie'].filter(Boolean).join(' ');
  return (
    <div className={clases}>
      <header className="cabecera">
        {volver !== undefined ? (
          <button className="cabecera__boton" aria-label="Volver" disabled={volverDeshabilitado}
                  onClick={() => (typeof volver === 'number' ? navegar(volver) : navegar(volver))}>
            <ArrowLeft size={24} />
          </button>
        ) : <Store size={26} aria-hidden />}
        <div className="cabecera__marca">
          <div className="cabecera__titulo">{titulo ?? 'BodegaControl'}</div>
          {!titulo && <div className="cabecera__subtitulo">Ventas · Inventario · Reportes</div>}
        </div>
        {accion ?? (volver === undefined && (
          <button className="cabecera__boton" aria-label="Cerrar sesión" onClick={() => void cerrar()}>
            <LogOut size={22} />
          </button>
        ))}
      </header>
      <main className="contenido">{children}</main>
      {pie && <div className="pie-acciones">{pie}</div>}
      {navegacion && <NavInferior />}
    </div>
  );
}

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <div className="encabezado-fila">
      <div>
        <h1 className="titulo-pantalla">{titulo}</h1>
        {subtitulo && <p className="subtitulo-pantalla">{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}
