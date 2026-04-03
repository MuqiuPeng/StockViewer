/**
 * Canonical data source definitions.
 *
 * IDs follow the  market.category  convention and are provider-agnostic.
 * The same ID is stored in the database, passed to the data service API,
 * and used throughout the frontend — switching DATA_PROVIDER never requires
 * changes here.
 *
 * Adding a new data source:
 *  1. Add an entry below.
 *  2. Implement the ID in each provider's DATA_SOURCES map.
 *  3. Write a DB migration if existing records need renaming.
 */

export interface DataSourceConfig {
  /** Canonical identifier, stored in DB and sent to data service. */
  id: string;
  name: string;
  category: string;
  description: string;
  defaultParams: Record<string, unknown>;
  requiredParams: string[];
  symbolFormat?: string;
  exampleSymbol?: string;
  /**
   * Which listing API endpoint to call when the user browses symbols.
   * Undefined means this source has no symbol browser.
   */
  listingApi?: string;
}

export const DATA_SOURCES: DataSourceConfig[] = [
  // ── China A-shares ──────────────────────────────────────────────────
  {
    id: 'cn.stock',
    name: 'A股',
    category: 'A股',
    description: 'A股日线历史数据，支持前复权和后复权',
    defaultParams: { period: 'daily', adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '6位数字 (如: 000001)',
    exampleSymbol: '000001',
    listingApi: '/api/stock-list?market=a_share',
  },
  {
    id: 'cn.stock.b',
    name: 'B股',
    category: 'B股',
    description: 'B股日线历史数据，包含复权因子',
    defaultParams: { adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: 'sh/sz + 6位数字 (如: sh900901)',
    exampleSymbol: 'sh900901',
  },
  {
    id: 'cn.stock.cdr',
    name: 'CDR 存托凭证',
    category: 'CDR',
    description: '存托凭证日线历史数据',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '6位数字 (如: 688126)',
    exampleSymbol: '688126',
  },

  // ── Hong Kong stocks ─────────────────────────────────────────────────
  {
    id: 'hk.stock',
    name: '港股',
    category: '港股',
    description: '香港股票日线历史数据',
    defaultParams: { period: 'daily', adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '5位数字 (如: 00700)',
    exampleSymbol: '00700',
    listingApi: '/api/stock-list?market=hk',
  },

  // ── US stocks ────────────────────────────────────────────────────────
  {
    id: 'us.stock',
    name: '美股',
    category: '美股',
    description: '美国股票日线历史数据',
    defaultParams: { period: 'daily', adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '股票代码 (如: AAPL)',
    exampleSymbol: 'AAPL',
    listingApi: '/api/stock-list?market=us',
  },

  // ── Chinese indices ──────────────────────────────────────────────────
  {
    id: 'cn.index',
    name: '中国指数',
    category: '指数',
    description: '中国股票指数历史数据',
    defaultParams: { period: 'daily' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '指数代码 (如: 000001 上证指数)',
    exampleSymbol: '000001',
    listingApi: '/api/index-list?source=zh',
  },

  // ── HK indices ───────────────────────────────────────────────────────
  {
    id: 'hk.index',
    name: '港股指数',
    category: '指数',
    description: '香港股票指数历史数据',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数代码 (如: HSI 恒生指数)',
    exampleSymbol: 'HSI',
    listingApi: '/api/index-list?source=hk',
  },

  // ── US indices ───────────────────────────────────────────────────────
  {
    id: 'us.index',
    name: '美股指数',
    category: '指数',
    description: '美国股票指数历史数据',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数代码 (如: .INX 标普500)',
    exampleSymbol: '.INX',
    listingApi: '/api/index-list?source=us',
  },

  // ── Global indices ───────────────────────────────────────────────────
  {
    id: 'global.index',
    name: '全球指数',
    category: '指数',
    description: '全球股票指数历史数据',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数名称 (如: 标普500)',
    exampleSymbol: '标普500',
    listingApi: '/api/index-list?source=global',
  },

  // ── Funds & ETFs ─────────────────────────────────────────────────────
  {
    id: 'cn.etf',
    name: 'ETF 基金',
    category: '基金',
    description: 'ETF基金历史数据',
    defaultParams: { period: 'daily', adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '基金代码 (如: 510300)',
    exampleSymbol: '510300',
    listingApi: '/api/fund-list?type=etf',
  },
  {
    id: 'cn.lof',
    name: 'LOF 基金',
    category: '基金',
    description: 'LOF基金历史数据',
    defaultParams: { period: 'daily', adjust: 'qfq' },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '基金代码 (如: 163402)',
    exampleSymbol: '163402',
    listingApi: '/api/fund-list?type=lof',
  },

  // ── Futures ──────────────────────────────────────────────────────────
  {
    id: 'cn.futures',
    name: '国内期货',
    category: '期货',
    description: '国内期货日线历史数据',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '合约代码 (如: RB0)',
    exampleSymbol: 'RB0',
    listingApi: '/api/futures-list',
  },
  {
    id: 'global.futures',
    name: '外盘期货',
    category: '期货',
    description: '国外期货历史数据',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '合约代码 (如: CL)',
    exampleSymbol: 'CL',
  },
];

// ---------------------------------------------------------------------------
// Legacy ID aliases — old AKShare-style names that may still exist in the DB
// during the migration window. Maps old → new canonical ID.
// ---------------------------------------------------------------------------
export const LEGACY_ID_MAP: Record<string, string> = {
  stock_zh_a_hist:          'cn.stock',
  stock_zh_a_daily:         'cn.stock',
  stock_zh_a_hist_tx:       'cn.stock',
  stock_zh_b_daily:         'cn.stock.b',
  stock_zh_a_cdr_daily:     'cn.stock.cdr',
  stock_hk_daily:           'hk.stock',
  stock_hk_hist:            'hk.stock',
  stock_us_hist:            'us.stock',
  index_zh_a_hist:          'cn.index',
  stock_zh_index_daily:     'cn.index',
  stock_zh_index_daily_tx:  'cn.index',
  stock_zh_index_daily_em:  'cn.index',
  stock_hk_index_daily_sina:'hk.index',
  stock_hk_index_daily_em:  'hk.index',
  index_us_stock_sina:      'us.index',
  index_global_hist_em:     'global.index',
  index_global_hist_sina:   'global.index',
  fund_etf_hist_em:         'cn.etf',
  fund_etf_hist_sina:       'cn.etf',
  fund_lof_hist_em:         'cn.lof',
  futures_zh_daily_sina:    'cn.futures',
  futures_foreign_hist:     'global.futures',
};

/** Resolve a potentially-legacy ID to the canonical form. */
export function resolveDataSourceId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id;
}

/** Look up config by ID (accepts both canonical and legacy IDs). */
export function getDataSourceConfig(id: string): DataSourceConfig | undefined {
  const canonical = resolveDataSourceId(id);
  return DATA_SOURCES.find(ds => ds.id === canonical);
}

export function getDataSourcesByCategory(category: string): DataSourceConfig[] {
  return DATA_SOURCES.filter(ds => ds.category === category);
}

export function getDataSourceCategories(): string[] {
  return [...new Set(DATA_SOURCES.map(ds => ds.category))];
}
