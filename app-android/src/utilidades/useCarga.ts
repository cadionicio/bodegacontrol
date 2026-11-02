/** Carga de datos de la API con estados de carga y error, y recarga manual (p. ej. tras guardar). */
import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { mensajeDeError } from '../api/cliente';

export function useCarga<T>(cargar: () => Promise<T>, dependencias: DependencyList) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(cargar, dependencias);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try { setDatos(await ejecutar()); } catch (e) { setError(mensajeDeError(e)); } finally { setCargando(false); }
  }, [ejecutar]);

  useEffect(() => { void recargar(); }, [recargar]);
  return { datos, error, cargando, recargar, setDatos };
}
