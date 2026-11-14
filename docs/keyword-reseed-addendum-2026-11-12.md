# Keyword Planner re-seed — addendum, 12.11.2026

New addendum. Does not replace or edit any earlier addendum.

## Method

- Tool: Google Ads Keyword Planner → **Discover new keywords**, account Go Top (989-586-4448).
- **Re-seed method**: the three seeds for each market are the three highest-volume terms that
  **Google itself returned** for that market in the 11.11 measurement. No hand-written list.
- Date range: **Oct 2025 – Sep 2026**, set manually on every run.
- Network: **Google only**. Language chip: the market's language, applied and confirmed on screen.
- Currency: ILS (₪), the account's billing currency.
- Read-only. No campaign, bid, plan or setting was changed.

### Date-range caveat (important for comparability)

At midnight on 12.11 Google's "Last 12 months" preset rolled over to **Nov 2025 – Oct 2026**.
Every run below was switched back to Oct 2025 – Sep 2026 by hand and the applied range was
re-read from the page before extracting. One run (Finland) was caught with the wrong range
applied and was re-run; both passes returned identical figures.

### Correction carried in from the first attempt

Do **not** seed from `semrush.com` or `ahrefs.com`. Tested on Korea: the "Start with a website"
mode returned 11 ideas, all brand variants (`bin semrush`, `semrush ou ahrefs`, `ricerca semrush`),
none above 10/mo. Google derives keywords from the site's own content, so a large brand's
home page yields its own brand terms. A local competitor or a category page would be needed.

---

## Why the re-seed matters: pool size, round 1 vs re-seed

| Market | Round 1 pool | Re-seed pool |
|---|---|---|
| South Korea | 3 | **859** |
| Sweden | 21 | **526** |
| Greece | 3 | **624** |
| Romania | 3 | **274** |
| Hungary | 5 | **828** |
| Denmark | 22 | **1,034** |
| Norway | 13 | **652** |
| Finland | 4 | **314** |
| Czechia | 27 | **899** |

---

## MISSPELLED AND UNACCENTED VARIANTS

The single most valuable output of this method. A hand-written list cannot generate these;
only Google's own output can. In five of nine markets the **misspelling outranks the correct
spelling**.

### `my businnes` — the misspelling of "my business", found in every market tested

| Market | `my businnes` | correct `google my business` | 3-mo | YoY | bid high |
|---|---|---|---|---|---|
| Greece | **14,800** | 8,100 | 0% | 0% | ₪138.64 |
| Romania | **12,100** | 4,400 | +22% | **+22%** | ₪313.99 |
| Denmark | **2,900** | 2,400 | +86% | **+184%** | ₪122.94 |
| Finland | **2,900** | 1,300 | 0% | **+50%** | ₪51.14 |
| Czechia | 2,900 | 1,300 | -33% | -33% | ₪204.91 |
| Norway | **2,400** | 1,000 | +22% | **+132%** | ₪589.33 |

It is growing in four of the six, in Denmark at +184% and Norway at +132% YoY.

### `google bu` — truncation, carries a very high bid

| Market | volume | bid high |
|---|---|---|
| Romania | 4,400 | ₪269.84 |
| Norway | 1,000 | ₪530.62 |
| Denmark | 1,900 | ₪56.39 |
| Czechia | 1,600 | ₪40.15 |
| Finland | 1,600 | ₪19.97 |

### `seost` — run-together "seo" + "st", present in every market

Sweden 2,400 · Finland 1,900 · Hungary 1,000 · Norway 1,000 · Denmark 1,000 · Czechia 880 · Greece 880.
No bid data on any of them, which suggests nobody is bidding on it.

### Per-market diacritic habit — which keyboard behaviour produces the variants

- **Greek** — accents (τόνοι) dropped: `κατασκευη ιστοσελιδασ` 1,000 vs accented 4,400;
  final -ς typed as -σ. Greek keyboards require a dead key for the accent, so it is skipped.
- **Romanian** — ș/ț/ă/î dropped: `optimizari seo` 1,900 alongside `optimizare seo` 1,900;
  `seo agentie` 2,400 alongside `agenție seo` 2,400. Also spaces removed: `crearesite` 2,400,
  `creare siteuri` / `creare site uri` 390.
- **Hungarian** — long vowels á/é/í/ó/ő/ú/ű shortened: `weboldal keszites` 320 (+52% YoY),
  `weboldalkeszites` 320, `weboldal készítés arak` 1,000 (vs `árak`), `seo jelentese` 590.
  Compounds also written without the space.
- **Czech** — háček/čárka dropped: `webove stránky` 1,600 and `webove stranky` 260
  alongside `webové stránky` 1,600.
- **Danish / Norwegian** — no diacritic loss of note; the variants are English-term
  misspellings (`my businnes`, `google bu`) and inflected forms (`hjemmesiden`, `nettsiden`).
- **Finnish** — no diacritic loss; see the contamination warning below instead.

---

## ⚠ FINLAND — `seo` is contaminated and must not be used as a demand signal

Finnish `seo` shows 12,100/mo, which in the 11.11 addendum was read as Finland's strongest term.
The re-seed shows what is inside it:

```
seo huoltoasema     390   (huoltoasema = petrol station)
seo parkki          260   (parkki = parking)
seo hamari        1,300
hamari seo        1,300
hamarin seo       1,300
seo hamari          210
```

**SEO is a Finnish petrol-station chain.** A large share of Finnish `seo` volume is people
looking for a filling station, not search optimisation. Finland's real SEO demand is
`hakukoneoptimointi` at **1,000/mo, -63% YoY** — an order of magnitude smaller.
**Finland should drop sharply in the ordering.** This is the clearest case in the whole
measurement of a raw number meaning the opposite of what it appears to mean.

---

## Per-market results

All figures: avg monthly searches · 3-month change · YoY change · competition · top-of-page bid low/high.

### ROMANIA — pool 274
```
my businnes                 12,100   +22%   +22%  Low    ₪26.87  ₪313.99
google my business           4,400     0%   -18%  Low    ₪49.91  ₪601.42
google bu                    4,400     0%     0%  Low     ₪6.13  ₪269.84
servicii seo                 2,900     0%     0%  Low     ₪4.93   ₪16.04
creare site                  2,400   +50%   -17%  High    ₪7.31   ₪13.47
agenție seo                  2,400  +164%   -57%  Low     ₪5.36   ₪17.40
seo agentie (unaccented)     2,400  +164%   -57%  Low     ₪5.36   ₪17.40
crearesite (no space)        2,400   +50%   -17%  High    ₪7.31   ₪13.47
optimizare seo               1,900     0%     0%  Low     ₪4.91   ₪25.23
optimizari seo (unaccented)  1,900     0%     0%  Low     ₪4.91   ₪25.23
servicii seo profesionale    1,900     0%   -46%  Low     ₪4.00   ₪13.33
creare site web pret           590   -33%   -33%  Medium  ₪5.33   ₪10.71
pret realizare site web        590   -33%   -33%  Medium  ₪5.33   ₪10.71
costuri creare site            590   -33%   -33%  Medium  ₪5.33   ₪10.71
```
New category round 1 missed: **price intent** (`pret`, `costuri`) — six distinct phrasings at 590 each.

### HUNGARY — pool 828
```
weboldal készítés            4,400   +52%     0%  High    ₪8.11   ₪25.33
seo                          2,400   +48%   -64%  Medium  ₪4.50   ₪15.64
google cégprofil             1,000   +19%  +222%  Low     ₪2.48  ₪319.99
weboldal készítés árak       1,000     0%     0%  High    ₪7.77   ₪12.47
weboldal készítés arak       1,000     0%     0%  High    ₪7.77   ₪12.47
seost                        1,000   -12%   -32%  Low         —       —
weboldalakat                 1,000   +14%     0%  Medium  ₪3.02   ₪15.11
keresőoptimalizálás            590     0%   -46%  Medium  ₪8.68   ₪31.82
wordpress weboldal készítés    590   +50%   +50%  Medium  ₪4.46   ₪15.67
seocheck                       590   +23%     0%  Medium  ₪1.38    ₪4.92
seo jelentés / jelentese       590   +22%   -19%  Medium  ₪0.62    ₪3.01
honlap                         480     0%   -19%  Medium  ₪3.59   ₪13.43
weboldal keszites              320   +52%   +52%  High    ₪7.21   ₪20.95
linképítés  (link building)    210   +27%   -46%  Medium  ₪1.95   ₪26.75
seo szövegírás (copywriting)   170   -19%  +189%  Low     ₪2.44   ₪12.92
seo tanácsadás                 170  +189%  +136%  Low     ₪4.09   ₪27.93
```
New categories round 1 missed: **link building**, **SEO copywriting** (+189% YoY),
**SEO consulting** (+136% YoY), **price intent** (`árak`).

### DENMARK — pool 1,034 (largest of all nine)
```
seo                          2,900     0%   -65%  Medium  ₪8.13   ₪33.43
my businnes                  2,900   +86%  +184%  Low    ₪19.41  ₪122.94
google my business           2,400     0%   -17%  Low    ₪12.28  ₪613.57
hjemmeside                   2,400     0%   -17%  Medium ₪13.10   ₪47.10
hjemmesiden                  2,400     0%   -17%  Medium ₪13.10   ₪47.10
google bu                    1,900     0%     0%  Low     ₪7.03   ₪56.39
seost                        1,000     0%     0%  Low         —       —
hjemmeside pris                880   -46%   -84%  Medium ₪12.27   ₪31.21
hjemmeside design              880   -18%   -75%  High   ₪16.66   ₪52.58
lav en hjemmeside              720     0%   -63%  High   ₪21.74   ₪97.29
wordpress hjemmeside           590   -35%   -92%  Medium  ₪9.54   ₪28.53
wix hjemmeside                 480   +22%   -19%  Medium  ₪8.42   ₪28.50
seo tekster / seo teksti       480   +50%     0%  Low     ₪5.83   ₪14.43
```
Price intent again, five phrasings at 880. **SEO copywriting** (`seo tekster`) at 480, 0% YoY.

### NORWAY — pool 652
```
my businnes                  2,400   +22%  +132%  Low    ₪23.93  ₪589.33
seo                          1,900   +23%   -16%  Low     ₪7.22   ₪34.54
nettside                     1,600   +30%   -32%  Medium  ₪9.65   ₪29.59
google my business           1,000     0%     0%  Low    ₪14.50  ₪587.38
google bu                    1,000     0%     0%  Low    ₪18.37  ₪530.62
seost                        1,000     0%     0%  Low         —       —
lage nettside                  390     0%   -33%  High   ₪17.60   ₪52.30
søkemotoroptimalisering        390   +55%   -65%  Medium  ₪9.02   ₪41.12
wix nettside                   260  +143%   -47%  Medium  ₪8.83   ₪34.84
seocheck                       210     0%   -34%  Medium  ₪4.97   ₪18.87
seo spesialist                 170   -36%   +40%  Medium ₪13.78  ₪163.67
nettside pris                  170   -36%   -67%  Medium ₪13.27   ₪29.31
```
**`seo spesialist` carries a ₪163.67 bid at only 170/mo** — the highest value-per-search
seen in the Nordics. Norway's three top bids are all ₪530–590.

### FINLAND — pool 314 (smallest) — see contamination warning above
```
seo                         12,100   -33%   -45%  Low     ₪6.69   ₪40.05   ← CONTAMINATED
my businnes                  2,900     0%   +50%  Low     ₪7.93   ₪51.14
seost                        1,900   -33%   -16%  Low         —       —
google bu                    1,600     0%     0%  Low     ₪3.40   ₪19.97
google my business           1,300     0%   -38%  Low    ₪10.95  ₪155.47
hamari seo / hamarin seo     1,300   -69%   -18%  Low         —       —   ← petrol brand
hakukoneoptimointi           1,000   -18%   -63%  Medium  ₪9.08   ₪18.25  ← the real term
seo huoltoasema                390   +24%   -64%  Low         —       —   ← petrol station
seo parkki                     260     0%   +24%  Low         —       —   ← parking
hakukoneoptimointi hinta       210     0%   -33%  Medium  ₪7.45   ₪13.95
```

### CZECHIA — pool 899
```
seo                          2,900   -33%   -70%  Medium  ₪5.83   ₪14.30
my businnes                  2,900   -33%   -33%  Low    ₪16.56  ₪204.91
webové stránky               1,600     0%   -32%  High    ₪5.17   ₪16.82
webove stránky (unaccented)  1,600     0%   -32%  High    ₪5.17   ₪16.82
google bu                    1,600     0%     0%  Low     ₪4.82   ₪40.15
google my business           1,300     0%   -38%  Low    ₪66.33  ₪752.98
tvorba webových stránek      1,300     0%   -23%  High   ₪10.24   ₪31.75
tvorba webu                    880   -12%     0%  High    ₪8.47   ₪25.65
seost                          880   +22%   -12%  Low         —       —
seocheck                       480   -18%   -46%  Medium  ₪2.20    ₪6.83
seotest                        390   +23%   -18%  High    ₪2.35    ₪6.29
klíčové slovo                  390  +238%   +49%  Low     ₪2.59    ₪4.27
seo optimalizace               260   +27%   -56%  Medium  ₪5.82   ₪21.69
seo servis                     260  +129%     0%  Medium  ₪2.35    ₪5.56
```
**Czechia has the highest `google my business` bid of all nine markets: ₪752.98.**

---

## Cross-market categories the 11.11 hand-written list missed entirely

1. **Checker / test tools** — `seocheck`, `seotest`. The product's own category.
   Present in Sweden 480, Hungary 590, Czechia 480, Greece 590, Norway 210.
2. **Platform / CMS** — WordPress, Wix, Shopify, Yoast. Google's own Refine panel named
   "Plattform: wordpress, shopify" in Sweden and "Brand or Non-Brand: wordpress" in Czechia.
3. **Price intent** — `pret`/`costuri` (RO), `árak` (HU), `pris` (DK/NO), `hinta` (FI),
   `τιμες` (EL). Five to six phrasings per market, consistently 170–1,000/mo.
4. **Informational** — `seo vad är` (SE) 390, `seo τι είναι` (EL) 390, `seo 란` (KR) 720,
   `seo jelentése` (HU) 590. Top-of-funnel traffic.
5. **Consultant / agency** — `seo konsult` (SE) 260 ₪64, `seo spesialist` (NO) 170 ₪163,
   `seo tanácsadás` (HU) 170 +136%.
6. **Link building and copywriting** — `linképítés` (HU) 210, `seo szövegírás` (HU) 170 +189%,
   `seo tekster` (DK) 480.
7. **Competing search engine** — `네이버 seo` (KR) 480 +23%. No equivalent in Europe.
8. **Verticals** — `병원 홈페이지` (KR, hospital) 390, `κατασκευή eshop` (EL) 720,
   `verkkokaupan hakukoneoptimointi` (FI) 110.

---

## What is NOT in this addendum

- **Portugal, Saudi Arabia and the Russian-speaking diaspora were not re-seeded.**
  Their 11.11 figures stand unrevised and should be treated as a floor, the same way the
  other markets' were before today.
- URL seeding with a **local competitor** site was not attempted. Only semrush.com was tested,
  and it failed for the reason recorded at the top.
- No second-generation re-seed (seeding again from the re-seed's own output) was run.

## Account state

Read-only throughout. No campaign, bid, budget, plan or account setting was changed.
The draft plans Keyword Planner creates automatically when a keyword list is entered were
left in place and untouched, including the seven from 11.11. Nothing committed, nothing pushed.
