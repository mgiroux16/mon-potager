export interface CompressOptions {
  maxSide?: number
  quality?: number
}

// Calcule les dimensions cibles en bornant le plus grand côté à maxSide,
// ratio préservé. Pure et testable sans canvas.
export function computeTargetDimensions(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) return { width, height }
  const ratio = width >= height ? maxSide / width : maxSide / height
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image illisible'))
    img.src = src
  })
}

// Lit un fichier image, le redimensionne via canvas et renvoie une data URL JPEG
// compressée. Utilise les API navigateur (FileReader, Image, canvas) : non couvert
// par les tests unitaires jsdom, la logique testable est isolée dans
// computeTargetDimensions.
export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const { maxSide = 1280, quality = 0.7 } = options
  const sourceUrl = await readFileAsDataUrl(file)
  const img = await loadImage(sourceUrl)
  const { width, height } = computeTargetDimensions(img.width, img.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return sourceUrl
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}
