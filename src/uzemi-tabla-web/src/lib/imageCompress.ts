/** Client-side downscale + JPEG compression before a task photo is
 * uploaded, mirroring the design mock's canvas-based approach — keeps a
 * phone photo from bloating the DB row (see production-service's
 * addImageSchema size cap). */
export function compressImageFile(file: File, maxDim = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Fájl olvasása sikertelen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Kép betöltése sikertelen"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas nem elérhető"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
