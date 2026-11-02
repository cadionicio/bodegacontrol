/** Almacenamiento persistente del celular (SharedPreferences en Android, localStorage en navegador). */
import { Preferences } from '@capacitor/preferences';

export async function leer<T>(clave: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key: clave });
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null; // un dato corrupto no debe impedir abrir la app
  }
}
export const guardar = (clave: string, valor: unknown) => Preferences.set({ key: clave, value: JSON.stringify(valor) });
export const borrar = (clave: string) => Preferences.remove({ key: clave });
