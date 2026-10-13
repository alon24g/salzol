# M3 — Promotions (2026-10-13)

All promo semantics were derived from **real PromoFull files** of Shufersal, Rami Levy and Victory,
by joining each promotion with the same store's regular prices and reading the Hebrew description
(`pipeline/tests/inspect_promos.py`, `sample_promos.py`). Field names turned out to be misleading in
several places; the findings are documented in the `pipeline/promos.py` docstring.

## What the data actually says

All three chains use the same nested layout (`Promotion → Groups → Group → PromotionItems →
PromotionItem`), with item-level `RewardType`:

| RewardType | Meaning (verified) | Model |
|---|---|---|
| 1, 10 | "N for ₪X": `MinQty` items for `DiscountedPrice` total | `n_for_price` (`fixed_price` when N = 1) |
| 3 | fixed unit price | `fixed_price` |
| 0 | Victory/Rami Levy: "X+Y" (X = `MinQty`, Y = `IsGiftItem`). Shufersal: mostly basket coupons | `buy_x_get_y` when the description says X+Y, else coupon/unknown |
| 2 | gift / personal coupon / "תו זהב 5%" | coupon: never applied, not shipped |
| 12 | Shufersal credit-card deals | club-only, `unknown` |

Other findings:
- `IsGiftItem` is a quantity, not a flag. `MinNoOfItemOffered` is always 10 (meaningless).
- Group 2+ is the *reward side* of a deal (the free item of "1+1", the half-price item of
  "השני בחצי" — which Rami Levy encodes as a fixed price!). It is skipped; group 1 describes the deal.
- Shufersal also encodes "1+1" as RewardType 1 with DiscountedPrice = regular price.
- **Weighted items**: `MinQty` is a weight. Rami Levy `0.010` = "any amount, price per kg"; Shufersal
  "200ב30" = 200 g for ₪30 (₪150/kg); Victory `0.25` for ₪22 = ₪88/kg — but Shufersal "קטיף 3.90
  חצילים" `0.10` for ₪3.90 means ₪3.90/kg. `DiscountedPricePerMida` is unreliable (Victory: per 250 g).
  Resolved by: grams in the description → else ≤0.05 kg = per kg → else the build picks the reading
  below the regular per-kg price (24 promos).
- **Clubs**: Victory `ClubID 2` = "מקס ויקטורי" (credit card), `1` = Wolt-channel/personal coupons
  (shown, never applied). Rami Levy: free-text club expressions. Shufersal: `"0 - כלל הלקוחות"` /
  `"3 - מועדון לקוחות & …"`.
- **Weekdays**: `PromotionDays="2,3"` exists only at Victory, on organic/vegan/gluten-free products,
  and only at 2 stores (שבעת הכוכבים, הרצלייה; איילון, רמת גן). Interpreted as 1 = Sunday →
  Monday + Tuesday (**to confirm**).
- **End times**: Shufersal ends deals at 02:59 the next morning → treated as the previous day.
- Basket thresholds (`MinPurchaseAmount`, e.g. "מעל 50") and limits (`MaxQty` units,
  `RedemptionLimit` times) are kept.

## Numbers (build of 2026-10-13)

| | Shufersal | Rami Levy | Victory |
|---|---|---|---|
| promo rows read (all stores) | 439k | 185k | 248k |
| coupons skipped | 38k | 30k | 1.2k |
| promos shipped (merged across stores) | 14,265 | 3,699 | 5,276 |

Kinds: n_for_price 9,958 · fixed_price 12,993 · buy_x_get_y 178 · unknown 111 (shown as a badge,
never applied: "השני בחצי", "קנה ב-X קבל מתנה", credit-card bundles).
Sanity: 21,606 promos are cheaper than the chain's median regular price; 606 aren't (mostly
store-level price differences — the UI always uses min(regular, promo)).

Size: promos ≈ 700 KB gz in 500-promo chunks; a product page loads only the chunks it needs.
Price shards grew from 3.4 to 5.2 MB gz (item → promo index).

## Frontend

- Shopping date (today … +14 days) and per-chain club membership, remembered on the device.
- Quantity stepper (units / kg); chains ranked by the **total for that quantity** with the best
  applicable promo per store (promos don't stack: `AllowMultipleDiscounts` is ~always 0).
- Badges: applied deal + savings; "בקניית 2: 2 ב-₪30" when more units are needed; club-only;
  basket threshold; weekday-only; "מבצע שבועי" + verified date for manual deals; unknown deals with
  their description, marked as not included.
- `data/manual_deals.yaml` is supported and validated at build time; empty for now.

## Tests

- pipeline: 83 tests, incl. every promo kind/quirk above on trimmed real PromoFull files.
- web: 32 Vitest (price engine for every kind, dates, weekdays, clubs, limits) + 19 Playwright e2e
  on a real-data snapshot with the browser clock frozen at 2026-10-13.
