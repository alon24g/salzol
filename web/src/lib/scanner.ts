// Camera barcode scanning: the native BarcodeDetector where it supports retail barcodes
// (Chrome on Android, Safari 17+ on macOS), otherwise ZXing (iPhone, desktop Chrome on Windows),
// loaded only when needed.

/** Camera access needs a secure context (https or localhost) and a browser that offers it. */
export const canScan = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Reads one frame; null when no barcode is in view. */
export type Decode = (video: HTMLVideoElement) => Promise<string | null>

// Product barcodes in Israeli stores (GTIN-13 / GTIN-8, and UPC on imports).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
  getSupportedFormats(): Promise<string[]>
}

async function nativeDecoder(): Promise<Decode | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Detector) return null
  try {
    const supported = await Detector.getSupportedFormats()
    const formats = FORMATS.filter((f) => supported.includes(f))
    if (!formats.length) return null
    const detector = new Detector({ formats })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  } catch {
    return null
  }
}

async function zxingDecoder(): Promise<Decode> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  // No TRY_HARDER: its rotated retry fails in @zxing/browser ("Could not create a Canvas element").
  const hints = new Map<unknown, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
  ])
  const reader = new BrowserMultiFormatReader(hints as Map<never, never>)
  return async (video) => {
    try {
      return reader.decode(video).getText()
    } catch {
      return null // NotFoundException: nothing readable in this frame
    }
  }
}

export async function createDecoder(): Promise<Decode> {
  return (await nativeDecoder()) ?? zxingDecoder()
}
