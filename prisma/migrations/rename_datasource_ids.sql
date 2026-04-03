-- Migration: rename legacy AKShare-style dataSource IDs to canonical market.category IDs
--
-- Run with:  psql $DATABASE_URL -f prisma/migrations/rename_datasource_ids.sql
-- Or via Prisma:  npx prisma db execute --file prisma/migrations/rename_datasource_ids.sql
--
-- The @@unique([symbol, dataSource]) constraint on Stock means we cannot have
-- two rows with the same symbol after renaming.  The UPDATE below is safe
-- because every old ID maps to exactly one new ID, so no duplicates are created
-- unless the same symbol was stored under multiple aliases — in that case the
-- later UPDATE will violate the unique constraint and the transaction will roll
-- back, letting you resolve the conflict manually.

BEGIN;

-- ── Stock table ──────────────────────────────────────────────────────────────

-- A股
UPDATE "Stock" SET "dataSource" = 'cn.stock'
  WHERE "dataSource" IN ('stock_zh_a_hist', 'stock_zh_a_daily', 'stock_zh_a_hist_tx');

-- B股
UPDATE "Stock" SET "dataSource" = 'cn.stock.b'
  WHERE "dataSource" = 'stock_zh_b_daily';

-- CDR
UPDATE "Stock" SET "dataSource" = 'cn.stock.cdr'
  WHERE "dataSource" = 'stock_zh_a_cdr_daily';

-- 港股
UPDATE "Stock" SET "dataSource" = 'hk.stock'
  WHERE "dataSource" IN ('stock_hk_daily', 'stock_hk_hist');

-- 美股
UPDATE "Stock" SET "dataSource" = 'us.stock'
  WHERE "dataSource" = 'stock_us_hist';

-- 中国指数
UPDATE "Stock" SET "dataSource" = 'cn.index'
  WHERE "dataSource" IN (
    'index_zh_a_hist',
    'stock_zh_index_daily',
    'stock_zh_index_daily_tx',
    'stock_zh_index_daily_em'
  );

-- 港股指数
UPDATE "Stock" SET "dataSource" = 'hk.index'
  WHERE "dataSource" IN ('stock_hk_index_daily_sina', 'stock_hk_index_daily_em');

-- 美股指数
UPDATE "Stock" SET "dataSource" = 'us.index'
  WHERE "dataSource" = 'index_us_stock_sina';

-- 全球指数
UPDATE "Stock" SET "dataSource" = 'global.index'
  WHERE "dataSource" IN ('index_global_hist_em', 'index_global_hist_sina');

-- ETF
UPDATE "Stock" SET "dataSource" = 'cn.etf'
  WHERE "dataSource" IN ('fund_etf_hist_em', 'fund_etf_hist_sina');

-- LOF
UPDATE "Stock" SET "dataSource" = 'cn.lof'
  WHERE "dataSource" = 'fund_lof_hist_em';

-- 国内期货
UPDATE "Stock" SET "dataSource" = 'cn.futures'
  WHERE "dataSource" = 'futures_zh_daily_sina';

-- 外盘期货
UPDATE "Stock" SET "dataSource" = 'global.futures'
  WHERE "dataSource" = 'futures_foreign_hist';


-- ── DataImportJob table ──────────────────────────────────────────────────────

UPDATE "DataImportJob" SET "dataSource" = 'cn.stock'
  WHERE "dataSource" IN ('stock_zh_a_hist', 'stock_zh_a_daily', 'stock_zh_a_hist_tx');

UPDATE "DataImportJob" SET "dataSource" = 'cn.stock.b'
  WHERE "dataSource" = 'stock_zh_b_daily';

UPDATE "DataImportJob" SET "dataSource" = 'cn.stock.cdr'
  WHERE "dataSource" = 'stock_zh_a_cdr_daily';

UPDATE "DataImportJob" SET "dataSource" = 'hk.stock'
  WHERE "dataSource" IN ('stock_hk_daily', 'stock_hk_hist');

UPDATE "DataImportJob" SET "dataSource" = 'us.stock'
  WHERE "dataSource" = 'stock_us_hist';

UPDATE "DataImportJob" SET "dataSource" = 'cn.index'
  WHERE "dataSource" IN (
    'index_zh_a_hist',
    'stock_zh_index_daily',
    'stock_zh_index_daily_tx',
    'stock_zh_index_daily_em'
  );

UPDATE "DataImportJob" SET "dataSource" = 'hk.index'
  WHERE "dataSource" IN ('stock_hk_index_daily_sina', 'stock_hk_index_daily_em');

UPDATE "DataImportJob" SET "dataSource" = 'us.index'
  WHERE "dataSource" = 'index_us_stock_sina';

UPDATE "DataImportJob" SET "dataSource" = 'global.index'
  WHERE "dataSource" IN ('index_global_hist_em', 'index_global_hist_sina');

UPDATE "DataImportJob" SET "dataSource" = 'cn.etf'
  WHERE "dataSource" IN ('fund_etf_hist_em', 'fund_etf_hist_sina');

UPDATE "DataImportJob" SET "dataSource" = 'cn.lof'
  WHERE "dataSource" = 'fund_lof_hist_em';

UPDATE "DataImportJob" SET "dataSource" = 'cn.futures'
  WHERE "dataSource" = 'futures_zh_daily_sina';

UPDATE "DataImportJob" SET "dataSource" = 'global.futures'
  WHERE "dataSource" = 'futures_foreign_hist';

COMMIT;
