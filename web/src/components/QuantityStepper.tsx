type Props = { weighted: boolean; value: number; onChange: (v: number) => void; compact?: boolean }

/** Units for packaged items, kg in 0.5 steps for weighted items. */
export function QuantityStepper({ weighted, value, onChange, compact = false }: Props) {
  const step = weighted ? 0.5 : 1
  const min = step
  const max = weighted ? 20 : 99
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  const size = compact ? 'h-8 w-8 text-base' : 'h-10 w-10 text-xl'
  const btn = `${size} rounded-lg border border-stone-300 bg-white leading-none disabled:opacity-40`

  return (
    <div className="flex items-center gap-2" data-testid="quantity">
      {!compact && <span className="text-sm text-stone-600">{weighted ? 'כמות (ק"ג):' : 'כמות:'}</span>}
      <button type="button" className={btn} aria-label="הוספה" onClick={() => set(value + step)} disabled={value >= max} data-testid="qty-plus">
        +
      </button>
      <output className="min-w-8 text-center font-semibold" aria-live="polite" data-testid="qty-value">
        {value}
        {compact && weighted && <span className="text-xs font-normal"> ק"ג</span>}
      </output>
      <button type="button" className={btn} aria-label="הפחתה" onClick={() => set(value - step)} disabled={value <= min} data-testid="qty-minus">
        −
      </button>
    </div>
  )
}
