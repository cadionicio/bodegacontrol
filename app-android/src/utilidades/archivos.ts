/** Entrega de reportes PDF/CSV: en Android se guarda y se abre el menú Compartir; en navegador se descarga. */
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const aBase64 = (blob: Blob) => new Promise<string>((ok, falla) => {
  const lector = new FileReader();
  lector.onload = () => ok(String(lector.result).split(',')[1]);
  lector.onerror = () => falla(lector.error);
  lector.readAsDataURL(blob);
});

export async function entregarArchivo(blob: Blob, nombre: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nombre });
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
    return;
  }
  const { uri } = await Filesystem.writeFile({ path: nombre, data: await aBase64(blob), directory: Directory.Cache });
  await Share.share({ title: nombre, files: [uri], dialogTitle: 'Guardar o enviar reporte' });
}
