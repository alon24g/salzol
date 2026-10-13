type Props = { weighted: boolean; value: number; onChange: (v: number) => void }

/** Units for packaged items, kg in 0.5 steps for weighted items. */
export function QuantityStepper({ weighted, value, onChange }: Props) {
  const step = weighted ? 0.5 : 1
  const min = step
  const max = weighted ? 20 : 99
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  const btn = 'h-10 w-10 rounded-lg border border-stone-300 bg-white text-xl leading-none disabled:opacity-40'

  return (
    <div className="flex items-center gap-3" data-testid="quantity">
      <span className="text-sm text-stone-600">{weighted ? 'כמות (ק"ג):' : 'כמות:'}</span>
      <button type="button" className={btn} aria-label="הוספה" onClick={() => set(value + step)} disabled={value >= max} data-testid="qty-plus">
        +
      </button>
      <output className="min-w-10 text-center text-lg font-semibold" aria-live="polite" data-testid="qty-value">
        {value}
      </output>
      <button type="button" className={btn} aria-label="הפחתה" onClick={() => set(value - step)} disabled={value <= min} data-testid="qty-minus">
        −
      </button>
    </div>
  )
}
