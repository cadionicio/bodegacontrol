/** Sesión del usuario y dirección del servidor, compartidas por toda la app. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configurarCliente } from '../api/cliente';
import { api } from '../api/recursos';
import type { Sesion, Usuario } from '../api/tipos';
import { URL_API_PREDETERMINADA } from '../configuracion';
import { borrar, guardar, leer } from '../utilidades/almacen';
import { cargarBorrador } from './borrador';

interface EstadoSesion {
  usuario: Usuario | null;
  listo: boolean;
  urlServidor: string;
  esPropietario: boolean;
  iniciar: (correo: string, contrasena: string, recordar: boolean) => Promise<void>;
  cerrar: () => Promise<void>;
  cambiarServidor: (url: string) => Promise<void>;
}

const Contexto = createContext<EstadoSesion | null>(null);
const CLAVE_SESION = 'sesion';
const CLAVE_SERVIDOR = 'servidor';

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [urlServidor, setUrlServidor] = useState(URL_API_PREDETERMINADA);
  const [listo, setListo] = useState(false);

  const cerrar = useCallback(async () => {
    configurarCliente({ token: null });
    setUsuario(null);
    await borrar(CLAVE_SESION); // el borrador de venta NO se borra: sobrevive a un cierre de sesión forzado
  }, []);

  const abrir = useCallback(async (sesion: Sesion) => {
    configurarCliente({ token: sesion.token });
    await cargarBorrador(sesion.usuario.usuario_id);
    setUsuario(sesion.usuario);
  }, []);

  useEffect(() => {
    configurarCliente({ alPerderSesion: () => void cerrar() });
    (async () => {
      const servidor = (await leer<string>(CLAVE_SERVIDOR)) ?? URL_API_PREDETERMINADA;
      configurarCliente({ urlBase: servidor });
      setUrlServidor(servidor);
      const guardada = await leer<Sesion>(CLAVE_SESION);
      if (guardada) await abrir(guardada);
      setListo(true);
      // Si el token ya no es válido, el cliente HTTP dispara alPerderSesion; sin red se sigue con la sesión local.
      if (guardada) api.sesion().catch(() => undefined);
    })();
  }, [abrir, cerrar]);

  const iniciar = useCallback(async (correo: string, contrasena: string, recordar: boolean) => {
    const sesion = await api.iniciarSesion(correo, contrasena);
    if (recordar) await guardar(CLAVE_SESION, sesion); else await borrar(CLAVE_SESION);
    await abrir(sesion);
  }, [abrir]);

  const cambiarServidor = useCallback(async (url: string) => {
    const limpia = url.trim().replace(/\/+$/, '');
    configurarCliente({ urlBase: limpia });
    setUrlServidor(limpia);
    await guardar(CLAVE_SERVIDOR, limpia);
  }, []);

  const valor = useMemo(() => ({
    usuario, listo, urlServidor, esPropietario: usuario?.rol === 'PROPIETARIO', iniciar, cerrar, cambiarServidor,
  }), [usuario, listo, urlServidor, iniciar, cerrar, cambiarServidor]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return contexto;
}

/** Atajo para pantallas protegidas: el enrutador garantiza que hay usuario. */
export const useUsuario = () => useSesion().usuario!;
