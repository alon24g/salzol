import { ComparePage } from './components/ComparePage'
import { Footer } from './components/Footer'
import { ListPage } from './components/ListPage'
import { LocationBar } from './components/LocationBar'
import { PricingSettings } from './components/PricingSettings'
import { ProductPage } from './components/ProductPage'
import { SearchPage } from './components/SearchPage'
import { SharePage } from './components/SharePage'
import { useLists } from './lib/lists'
import { usePlace } from './lib/location'
import { listHref, useRoute } from './lib/router'
import { usePricingSettings } from './lib/settings'

export default function App() {
  const route = useRoute()
  const { place, setPlace, locate, geoStatus } = usePlace()
  const { ctx, today, setDay, toggleClub } = usePricingSettings()
  const { active } = useLists()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4">
      <header className="mb-4 flex flex-col gap-3">
        <nav className="flex items-center justify-between gap-3">
          <a href="#/" className="text-2xl font-extrabold text-emerald-800">
            סל זול
          </a>
          <div className="flex items-center gap-3 text-sm">
            <a href="#/" className={route.name === 'search' ? 'font-semibold' : 'text-emerald-800'} data-testid="nav-search">
              חיפוש
            </a>
            <a href={listHref} className={route.name === 'list' ? 'font-semibold' : 'text-emerald-800'} data-testid="nav-list">
              🛒 הרשימה
              {active.items.length > 0 && (
                <span className="ms-1 rounded-full bg-emerald-700 px-1.5 text-xs text-white" data-testid="nav-list-count">
                  {active.items.length}
                </span>
              )}
            </a>
          </div>
        </nav>
        <LocationBar place={place} setPlace={setPlace} locate={locate} geoStatus={geoStatus} />
        <PricingSettings ctx={ctx} today={today} setDay={setDay} toggleClub={toggleClub} />
      </header>
      <main className="flex-1">
        {route.name === 'product' ? (
          <ProductPage barcode={route.barcode} place={place} ctx={ctx} />
        ) : route.name === 'list' ? (
          <ListPage />
        ) : route.name === 'compare' ? (
          <ComparePage place={place} ctx={ctx} />
        ) : route.name === 'share' ? (
          <SharePage data={route.data} />
        ) : (
          <SearchPage initialQuery={route.q} />
        )}
      </main>
      <Footer />
    </div>
  )
}
