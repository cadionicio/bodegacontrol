/**
 * Comprime la foto de la cámara antes de subirla: una foto de 4 MB se convierte en un JPEG de ~100 KB,
 * dentro del límite de 500 KB de la API y rápido de enviar con datos móviles.
 */
const LADO_MAXIMO = 900;

export async function comprimirFoto(archivo: File): Promise<Blob> {
  const mapa = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  const contexto = lienzo.getContext('2d')!;
  contexto.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  mapa.close();
  for (const calidad of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', calidad));
    if (blob && blob.size <= 480_000) return blob;
  }
  throw new Error('No se pudo reducir la foto por debajo de 500 KB');
}
