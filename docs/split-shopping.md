# Stretch: split shopping (2026-10-18)

The basket comparison now suggests buying the list at **two stores** when that is clearly better
than the best single store (spec §7.4 stretch).

## How it's computed (`bestSplits` in `web/src/lib/basket.ts`)

1. **Candidate stores:** the 40 best whole baskets in range (fewest missing items, then total), plus
   the 3 cheapest stores for each item. A store that is cheap for one expensive item can be the
   right second stop even if its whole basket ranks low.
2. **Estimate every pair:** each item at whichever of the two stores is cheaper, using the item's
   price there with promotions applied. Pairs are ordered by missing items, then by this estimate.
3. **Re-price the best 40 pairs:** each item goes to its cheaper store, then each store's share is
   priced again on its own. Promotions that pool several items ("3 for ₪10" across products) or need
   a minimum spend may stop applying once the list is split. A unit test covers a split that looks
   cheaper by item but costs more once a shared deal is lost.
4. Pairs where one store would get every item are skipped: that's a single store, not a split.

This is a heuristic, not an exhaustive search. The item assignment ignores how promotions interact
(moving one item could unlock a deal at the other store). The totals shown are always computed
properly for the assignment chosen.

## When it's shown (`splitWorthIt`)

- **It has fewer missing items than the best single store.** For example, no store nearby has
  everything but two stores together do. In "only stores with everything" mode it then appears
  under the "no store has everything" message.
- **Or it has the same number of missing items and saves at least ₪5 and at least 3%.** A second
  stop for a few shekels isn't advice.

The card appears right after the cheapest single store, which stays the main answer. It shows the
total, the saving, each store's items and subtotal (with the promotion used), and items neither
store sells. Store locations are their city's center, so a distance between the two stores is shown
only when they are in different cities.

On real data (Tel Aviv, 5 km, the README's 4-item list) the best single store is ₪55.00. Victory
for milk and soap plus Yohananof for Bamba and flour costs ₪49.40.

## Tests

- Unit tests (`basket.test.ts`): items are assigned to the cheaper store; a split covers items no
  single store has; a shared deal is lost and the split is re-priced; no split when one store is
  cheapest for everything; the ₪5 and 3% threshold.
- End-to-end tests (`lists.spec.ts`, Haifa, 20 km, fixture data):
  - The split appears right after the cheapest store and saves at least ₪5. Its two parts add up to
    its total, and each list item appears exactly once.
  - Cat treats and spelt flour: no single store has both, a pair does.
- Unit tests: 60 (was 56). Playwright: 47 (was 45).
