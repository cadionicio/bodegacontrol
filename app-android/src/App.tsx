/** Rutas de la app según el mapa de navegación del Prompt maestro (sección D). */
import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from './componentes/controles';
import { ProveedorSesion, useSesion } from './estado/sesion';
import { Escanear } from './pantallas/Escanear';
import { DetalleVentaHistorica } from './pantallas/historial/Detalle';
import { Historial } from './pantallas/historial/Lista';
import { Inicio } from './pantallas/Inicio';
import { RegistrarEntrada } from './pantallas/inventario/Entrada';
import { Inventario } from './pantallas/inventario/Lista';
import { RegistrarMerma } from './pantallas/inventario/Merma';
import { Movimientos } from './pantallas/inventario/Movimientos';
import { Login } from './pantallas/Login';
import { NuevoCliente } from './pantallas/NuevoCliente';
import { DetalleProducto } from './pantallas/productos/Detalle';
import { FormularioProducto } from './pantallas/productos/Formulario';
import { Productos } from './pantallas/productos/Lista';
import { GenerarReporte } from './pantallas/reportes/Generar';
import { VistaPrevia } from './pantallas/reportes/VistaPrevia';
import { Carrito } from './pantallas/ventas/Carrito';
import { Cobro } from './pantallas/ventas/Cobro';
import { Confirmar } from './pantallas/ventas/Confirmar';
import { VentaPendiente } from './pantallas/ventas/Pendiente';
import { VentaRegistrada } from './pantallas/ventas/Resultado';
import { RevisarVenta } from './pantallas/ventas/Revisar';

function Protegida({ children, soloPropietario }: { children: ReactNode; soloPropietario?: boolean }) {
  const { usuario, esPropietario } = useSesion();
  if (!usuario) return <Navigate to="/login" replace />;
  if (soloPropietario && !esPropietario) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Rutas() {
  const { listo, usuario } = useSesion();
  if (!listo) return <Cargando texto="Iniciando BodegaControl" />;
  const p = (elemento: ReactNode, soloPropietario = false) => <Protegida soloPropietario={soloPropietario}>{elemento}</Protegida>;
  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={p(<Inicio />)} />
      <Route path="/ventas" element={p(<Carrito />)} />
      <Route path="/ventas/cobro" element={p(<Cobro />)} />
      <Route path="/ventas/confirmar" element={p(<Confirmar />)} />
      <Route path="/ventas/revisar" element={p(<RevisarVenta />)} />
      <Route path="/ventas/pendiente" element={p(<VentaPendiente />)} />
      <Route path="/ventas/resultado/:id" element={p(<VentaRegistrada />)} />
      <Route path="/clientes/nuevo" element={p(<NuevoCliente />)} />
      <Route path="/escanear" element={p(<Escanear />)} />
      <Route path="/productos" element={p(<Productos />)} />
      <Route path="/productos/nuevo" element={p(<FormularioProducto />, true)} />
      <Route path="/productos/:id" element={p(<DetalleProducto />)} />
      <Route path="/productos/:id/editar" element={p(<FormularioProducto />, true)} />
      <Route path="/inventario" element={p(<Inventario />)} />
      <Route path="/inventario/entrada" element={p(<RegistrarEntrada />, true)} />
      <Route path="/inventario/merma" element={p(<RegistrarMerma />, true)} />
      <Route path="/inventario/:id" element={p(<Movimientos />)} />
      <Route path="/historial" element={p(<Historial />)} />
      <Route path="/historial/:id" element={p(<DetalleVentaHistorica />)} />
      <Route path="/reportes" element={p(<GenerarReporte />, true)} />
      <Route path="/reportes/vista-previa" element={p(<VistaPrevia />, true)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// HashRouter: en el APK los archivos se sirven sin servidor que reescriba rutas; el hash funciona siempre.
export const App = () => (
  <ProveedorSesion><HashRouter><Rutas /></HashRouter></ProveedorSesion>
);
