// Links to each chain's online store, searching for the product there.
// Checked 2026-10-14: Shufersal and Rami Levy find nothing by barcode but rank the right product
// first for its name; Victory (Self-Point platform, /search/:query) finds the exact barcode.

type Site = { label: string; url: (barcode: string, name: string) => string }

const SITES: Record<string, Site> = {
  shufersal: {
    label: 'שופרסל אונליין',
    url: (_, name) => `https://www.shufersal.co.il/online/he/search?text=${encodeURIComponent(name)}`,
  },
  rami_levy: {
    label: 'רמי לוי אונליין',
    url: (_, name) => `https://www.rami-levy.co.il/he/online/search?q=${encodeURIComponent(name)}`,
  },
  victory: {
    label: 'ויקטורי אונליין',
    url: (barcode) => `https://www.victoryonline.co.il/search/${encodeURIComponent(barcode)}`,
  },
}

export function chainSiteLink(chain: string, barcode: string, name: string): { label: string; href: string } | null {
  const site = SITES[chain]
  return site ? { label: site.label, href: site.url(barcode, name) } : null
}
