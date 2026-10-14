import { ComparePage } from './components/ComparePage'
import { Footer } from './components/Footer'
import { ListPage } from './components/ListPage'
import { LocationBar } from './components/LocationBar'
import { Logo } from './components/Logo'
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
  const { place, setPlace, locate, geoStatus, radiusKm, setRadius } = usePlace()
  const { ctx, today, setDay, toggleClub } = usePricingSettings()
  const { active } = useLists()
  const tab = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
      on ? 'bg-brand-700 text-white shadow-sm' : 'text-stone-700 hover:bg-white'
    }`

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-6">
      <header className="flex flex-col gap-3 pt-4 pb-5">
        <nav className="flex items-center justify-between gap-3">
          <a href="#/" className="flex items-center gap-2.5" aria-label="סל זול — לדף הבית">
            <Logo className="size-10 shrink-0" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-2xl font-extrabold text-brand-800">סל זול</span>
              <span className="mt-1 hidden text-xs text-stone-500 sm:block">משווים מחירים, חוסכים בכל קנייה</span>
            </span>
          </a>
          <div className="flex items-center gap-1 rounded-full bg-stone-900/5 p-1">
            <a href="#/" className={tab(route.name === 'search')} data-testid="nav-search">
              חיפוש
            </a>
            <a href={listHref} className={tab(route.name === 'list' || route.name === 'compare')} data-testid="nav-list">
              <span aria-hidden>🛒</span> הרשימה
              {active.items.length > 0 && (
                <span className="min-w-5 rounded-full bg-sun px-1.5 text-center text-xs font-bold text-stone-900" data-testid="nav-list-count">
                  {active.items.length}
                </span>
              )}
            </a>
          </div>
        </nav>
        <div className="card flex flex-col gap-2.5 px-4 py-3">
          <LocationBar place={place} setPlace={setPlace} locate={locate} geoStatus={geoStatus} radiusKm={radiusKm} setRadius={setRadius} />
          <div className="border-t border-dashed border-stone-200" />
          <PricingSettings ctx={ctx} today={today} setDay={setDay} toggleClub={toggleClub} />
        </div>
      </header>
      <main className="flex-1">
        {route.name === 'product' ? (
          <ProductPage barcode={route.barcode} place={place} radiusKm={radiusKm} setRadius={setRadius} ctx={ctx} />
        ) : route.name === 'list' ? (
          <ListPage />
        ) : route.name === 'compare' ? (
          <ComparePage place={place} radiusKm={radiusKm} ctx={ctx} />
        ) : route.name === 'share' ? (
          <SharePage data={route.data} />
        ) : (
          <SearchPage initialQuery={route.q} hasPlace={!!place} listCount={active.items.length} />
        )}
      </main>
      <Footer />
    </div>
  )
}
