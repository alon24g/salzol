import { Footer } from './components/Footer'
import { LocationBar } from './components/LocationBar'
import { ProductPage } from './components/ProductPage'
import { SearchPage } from './components/SearchPage'
import { usePlace } from './lib/location'
import { useRoute } from './lib/router'

export default function App() {
  const route = useRoute()
  const { place, setPlace, locate, geoStatus } = usePlace()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4">
      <header className="mb-4 flex flex-col gap-3">
        <a href="#/" className="text-2xl font-extrabold text-emerald-800">
          סל זול
        </a>
        <LocationBar place={place} setPlace={setPlace} locate={locate} geoStatus={geoStatus} />
      </header>
      <main className="flex-1">
        {route.name === 'product' ? (
          <ProductPage barcode={route.barcode} place={place} />
        ) : (
          <SearchPage initialQuery={route.q} />
        )}
      </main>
      <Footer />
    </div>
  )
}
