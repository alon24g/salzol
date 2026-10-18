import fs from 'node:fs'
import path from 'node:path'

// Chromium's fake camera (--use-file-for-fake-video-capture) plays a .y4m file. This draws an
// EAN-13 barcode into one 640×480 frame so the ZXing fallback reads a real image.
export const SCAN_BARCODE = '7290116936291' // חלב תנובה 3% שומן 2 ליטר (in the fixture)
export const BARCODE_VIDEO = path.join(import.meta.dirname, '.generated', 'ean13.y4m')

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** The 95 modules of an EAN-13 symbol, '1' = bar. */
export function ean13Modules(code: string): string {
  const d = [...code].map(Number)
  const left = d
    .slice(1, 7)
    .map((n, i) => (PARITY[d[0]][i] === 'L' ? L : G)[n])
    .join('')
  const right = d
    .slice(7)
    .map((n) => R[n])
    .join('')
  return `101${left}01010${right}101`
}

export function writeBarcodeVideo(code = SCAN_BARCODE, file = BARCODE_VIDEO) {
  const W = 640
  const H = 480
  const MODULE = 5
  const modules = ean13Modules(code)
  const x0 = Math.floor((W - modules.length * MODULE) / 2)
  const luma = Buffer.alloc(W * H, 235) // light "paper"
  for (let y = 120; y < 360; y++) {
    for (let m = 0; m < modules.length; m++) {
      if (modules[m] === '1') luma.fill(16, y * W + x0 + m * MODULE, y * W + x0 + (m + 1) * MODULE)
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`)
  fs.writeFileSync(file, Buffer.concat([header, luma, chroma, chroma]))
}
