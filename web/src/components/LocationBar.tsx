import { useEffect, useState } from 'react'
import { loadCities } from '../lib/data'
import type { GeoStatus } from '../lib/location'
import { RADIUS_OPTIONS, type Place } from '../lib/nearby'
import type { CityRow } from '../lib/types'

type Props = {
  place: Place | null
  setPlace: (p: Place | null) => void
  locate: () => void
  geoStatus: GeoStatus
  radiusKm: number
  setRadius: (km: number) => void
}

const GEO_MESSAGES: Partial<Record<GeoStatus, string>> = {
  locating: 'מאתרים את המיקום שלכם…',
  denied: 'הגישה למיקום נחסמה. אפשר לבחור עיר מהרשימה.',
  unavailable: 'לא הצלחנו לאתר מיקום. אפשר לבחור עיר מהרשימה.',
}

export function LocationBar({ place, setPlace, locate, geoStatus, radiusKm, setRadius }: Props) {
  const [cities, setCities] = useState<CityRow[]>([])
  const [editing, setEditing] = useState(!place)

  useEffect(() => {
    loadCities().then(setCities).catch(() => setCities([]))
  }, [])

  const pickCity = (name: string) => {
    const c = cities.find((row) => row[0] === name)
    if (!c) return
    setPlace({ label: c[0], lat: c[1], lon: c[2], source: 'city' })
    setEditing(false)
  }

  if (place && !editing) {
    return (
      <div className="flex flex-col gap-2 text-sm" data-testid="location-bar">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span aria-hidden>📍</span>
          <span>
            סופרים ליד <strong data-testid="location-label">{place.label}</strong>
          </span>
          <button type="button" className="link text-sm" onClick={() => setEditing(true)} data-testid="location-change">
            שינוי
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="מרחק מקסימלי">
          <span className="text-stone-500">עד</span>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === radiusKm}
              onClick={() => setRadius(r)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                r === radiusKm ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-brand-50'
              }`}
              data-testid={`radius-${r}`}
            >
              {r} ק"מ
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="location-bar">
      <p className="font-semibold text-stone-800">📍 איפה אתם קונים? נמצא את הסופרים הקרובים</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-2"
          onClick={() => {
            locate()
            setEditing(false)
          }}
          disabled={geoStatus === 'locating'}
          data-testid="locate-me"
        >
          השתמשו במיקום שלי
        </button>
        <span className="text-stone-500">או</span>
        <label className="flex items-center gap-2">
          <span className="sr-only">בחירת עיר</span>
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 focus:border-brand-600 focus:outline-none"
            defaultValue=""
            onChange={(e) => pickCity(e.target.value)}
            data-testid="city-select"
          >
            <option value="" disabled>
              בחירת עיר…
            </option>
            {cities.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {place && (
          <button type="button" className="text-stone-600 underline" onClick={() => setEditing(false)}>
            ביטול
          </button>
        )}
      </div>
      {GEO_MESSAGES[geoStatus] && (
        <p className="text-amber-800" role="status" data-testid="geo-status">
          {GEO_MESSAGES[geoStatus]}
        </p>
      )}
    </div>
  )
}
