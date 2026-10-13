import { useEffect, useState } from 'react'
import { loadCities } from '../lib/data'
import type { GeoStatus } from '../lib/location'
import { DEFAULT_RADIUS_KM, type Place } from '../lib/nearby'
import type { CityRow } from '../lib/types'

type Props = {
  place: Place | null
  setPlace: (p: Place | null) => void
  locate: () => void
  geoStatus: GeoStatus
}

const GEO_MESSAGES: Partial<Record<GeoStatus, string>> = {
  locating: 'מאתר מיקום…',
  denied: 'הגישה למיקום נחסמה. אפשר לבחור עיר.',
  unavailable: 'לא הצלחנו לאתר מיקום. אפשר לבחור עיר.',
}

export function LocationBar({ place, setPlace, locate, geoStatus }: Props) {
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
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="location-bar">
        <span>
          📍 חנויות עד {DEFAULT_RADIUS_KM} ק"מ מ<strong data-testid="location-label">{place.label}</strong>
        </span>
        <button type="button" className="text-emerald-800 underline" onClick={() => setEditing(true)} data-testid="location-change">
          שינוי
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="location-bar">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-3 py-2 font-medium text-white disabled:opacity-60"
          onClick={() => {
            locate()
            setEditing(false)
          }}
          disabled={geoStatus === 'locating'}
          data-testid="locate-me"
        >
          השתמש במיקום שלי
        </button>
        <span className="text-stone-500">או</span>
        <label className="flex items-center gap-2">
          <span className="sr-only">בחירת עיר</span>
          <select
            className="rounded-lg border border-stone-300 bg-white px-2 py-2"
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
