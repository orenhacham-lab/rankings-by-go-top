# Fonts in this folder

- `NotoSansJP-Regular.woff` — Noto Sans JP, Regular (400), Google Fonts v57,
  full Japanese coverage in one file (3.2 MB). Licensed under the SIL Open Font
  License 1.1 (https://openfontlicense.org), as published at
  https://fonts.google.com/noto/specimen/Noto+Sans+JP.

  It is served from our own domain, not from fonts.googleapis.com, so that a PDF
  render does not send a request to a third party and the privacy policies need
  no new recipient. `lib/export/cjk-font.ts` is the only thing that references it.

- `NotoSans-Regular.ttf`, `NotoSansHebrew-Regular.ttf` — Noto Sans and Noto Sans
  Hebrew, also under the SIL Open Font License 1.1.
