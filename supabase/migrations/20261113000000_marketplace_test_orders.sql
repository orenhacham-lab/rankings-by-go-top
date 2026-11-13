-- Mark a marketplace receipt that the PLATFORM itself declared a test order.
--
-- WHY THE COLUMN EXISTS AT ALL. Digistore24 approves a product by buying it,
-- and every purchase its reviewers make carries `api_mode=test`. Our parser
-- dropped those deliveries, so on 2026-11-12 their review purchase answered
-- SUCCESS in their IPN report, left no row here, sent no access email, and
-- came back as one of four stated reasons for rejecting all four products.
-- The parser now records them like any other order so the delivery actually
-- happens (lib/marketplace/intake.ts, MarketplaceOrderEvent.isTest).
--
-- The flag is the control that makes recording them acceptable: the row is a
-- real, claimable receipt, so it has to be findable and removable afterwards
-- with `select * from marketplace_orders where is_test`.
--
-- DEFAULT false AND NOT NULL, so every row already on file reads as live,
-- which is what they are — the only rows here predate this column.
-- Additive, with no backfill and no constraint change, so it cannot alter the
-- behaviour of a deploy that has not shipped the code yet.

alter table public.marketplace_orders
  add column if not exists is_test boolean not null default false;

comment on column public.marketplace_orders.is_test is
  'The selling platform declared this order a test (Digistore24 api_mode=test). The receipt is real and claimable; this marks it for removal after a review.';
