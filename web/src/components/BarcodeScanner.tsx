import { useEffect, useRef, useState } from 'react'
import { canonicalBarcode } from '../lib/data'
import { createDecoder } from '../lib/scanner'

type Status = 'starting' | 'scanning' | 'denied' | 'error'

const MESSAGES: Record<Status, string> = {
  starting: 'מפעילים את המצלמה…',
  scanning: 'כוונו את המצלמה לברקוד של המוצר',
  denied: 'אין גישה למצלמה. אפשר לאשר גישה בהגדרות הדפדפן, או להקליד את הברקוד בחיפוש.',
  error: 'לא הצלחנו להפעיל את המצלמה. אפשר להקליד את הברקוד בחיפוש.',
}

type Props = { onDetected: (barcode: string) => void; onClose: () => void }

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  // The latest callback, so the camera effect runs once per opening.
  const detected = useRef(onDetected)
  useEffect(() => {
    detected.current = onDetected
  })

  useEffect(() => {
    dialogRef.current?.showModal()
    let stopped = false
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const video = videoRef.current
        if (stopped || !video) return
        video.srcObject = stream
        await video.play()
        const decode = await createDecoder()
        if (stopped) return
        setStatus('scanning')
        while (!stopped) {
          const barcode = canonicalBarcode((await decode(video)) ?? '')
          if (barcode && !stopped) {
            navigator.vibrate?.(60)
            detected.current(barcode)
            return
          }
          await new Promise((r) => setTimeout(r, 150))
        }
      } catch (err) {
        if (!stopped) setStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error')
      }
    })()
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-stone-950 p-0 text-white shadow-2xl backdrop:bg-stone-950/70"
      aria-labelledby="scanner-title"
      onCancel={onClose}
      data-testid="barcode-scanner"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h2 id="scanner-title" className="font-display text-lg font-bold">
          סריקת ברקוד
        </h2>
        <button type="button" className="rounded-full px-3 py-1 text-sm font-semibold hover:bg-white/10" onClick={onClose} data-testid="scanner-close">
          סגירה
        </button>
      </div>
      <div className="relative aspect-[4/3] bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline aria-hidden />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-sun/90 shadow-[0_0_0_100vmax_rgb(0_0_0/0.35)]" aria-hidden />
        )}
      </div>
      <p className={`px-4 py-3 text-sm ${status === 'denied' || status === 'error' ? 'text-amber-300' : 'text-stone-300'}`} role="status" data-testid="scanner-status" data-status={status}>
        {MESSAGES[status]}
      </p>
    </dialog>
  )
}
