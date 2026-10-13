import { Footer } from './components/Footer'
import { LocationBar } from './components/LocationBar'
import { PricingSettings } from './components/PricingSettings'
import { ProductPage } from './components/ProductPage'
import { SearchPage } from './components/SearchPage'
import { usePlace } from './lib/location'
import { useRoute } from './lib/router'
import { usePricingSettings } from './lib/settings'

export default function App() {
  const route = useRoute()
  const { place, setPlace, locate, geoStatus } = usePlace()
  const { ctx, today, setDay, toggleClub } = usePricingSettings()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4">
      <header className="mb-4 flex flex-col gap-3">
        <a href="#/" className="text-2xl font-extrabold text-emerald-800">
          סל זול
        </a>
        <LocationBar place={place} setPlace={setPlace} locate={locate} geoStatus={geoStatus} />
        <PricingSettings ctx={ctx} today={today} setDay={setDay} toggleClub={toggleClub} />
      </header>
      <main className="flex-1">
        {route.name === 'product' ? (
          <ProductPage barcode={route.barcode} place={place} ctx={ctx} />
        ) : (
          <SearchPage initialQuery={route.q} />
        )}
      </main>
      <Footer />
    </div>
  )
}
