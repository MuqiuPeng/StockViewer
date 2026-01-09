/**
 * Comprehensive list of AKShare historical data sources
 */

export interface DataSourceConfig {
  id: string;
  name: string;
  category: string;
  description: string;
  apiEndpoint: string;
  defaultParams: Record<string, any>;
  requiredParams: string[];
  symbolFormat?: string;
  exampleSymbol?: string;
}

export const DATA_SOURCES: DataSourceConfig[] = [
  // ========== A-Share Stocks ==========
  {
    id: 'stock_zh_a_hist',
    name: 'A股历史数据 (主要)',
    category: 'A股',
    description: 'A股日线历史数据，支持前复权和后复权',
    apiEndpoint: 'stock_zh_a_hist',
    defaultParams: {
      period: 'daily',
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '6位数字 (如: 000001)',
    exampleSymbol: '000001'
  },
  {
    id: 'stock_zh_a_daily',
    name: 'A股历史数据 (新浪)',
    category: 'A股',
    description: 'A股日线历史数据 (新浪财经)，包含复权因子',
    apiEndpoint: 'stock_zh_a_daily',
    defaultParams: {
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: 'sh/sz + 6位数字 (如: sh000001)',
    exampleSymbol: 'sh000001'
  },
  {
    id: 'stock_zh_a_hist_tx',
    name: 'A股历史数据 (腾讯)',
    category: 'A股',
    description: 'A股日线历史数据 (腾讯财经)',
    apiEndpoint: 'stock_zh_a_hist_tx',
    defaultParams: {
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '6位数字 (如: 000001)',
    exampleSymbol: '000001'
  },
  {
    id: 'stock_zh_a_minute',
    name: 'A股分钟数据',
    category: 'A股',
    description: 'A股分钟级历史数据 (1/5/15/30/60分钟)',
    apiEndpoint: 'stock_zh_a_minute',
    defaultParams: {
      period: '60',
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'period'],
    symbolFormat: 'sh/sz + 6位数字 (如: sh000001)',
    exampleSymbol: 'sh000001'
  },
  {
    id: 'stock_zh_a_hist_min_em',
    name: 'A股分钟数据 (东财)',
    category: 'A股',
    description: 'A股分钟级历史数据 (东方财富)',
    apiEndpoint: 'stock_zh_a_hist_min_em',
    defaultParams: {
      period: '60',
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'start_date', 'end_date', 'period'],
    symbolFormat: '6位数字 (如: 000001)',
    exampleSymbol: '000001'
  },

  // ========== B-Share Stocks ==========
  {
    id: 'stock_zh_b_daily',
    name: 'B股历史数据',
    category: 'B股',
    description: 'B股日线历史数据，包含复权因子',
    apiEndpoint: 'stock_zh_b_daily',
    defaultParams: {
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: 'sh/sz + 6位数字 (如: sh900901)',
    exampleSymbol: 'sh900901'
  },
  {
    id: 'stock_zh_b_minute',
    name: 'B股分钟数据',
    category: 'B股',
    description: 'B股分钟级历史数据',
    apiEndpoint: 'stock_zh_b_minute',
    defaultParams: {
      period: '60',
      adjust: 'qfq'
    },
    requiredParams: ['symbol', 'period'],
    symbolFormat: 'sh/sz + 6位数字 (如: sh900901)',
    exampleSymbol: 'sh900901'
  },

  // ========== CDR ==========
  {
    id: 'stock_zh_a_cdr_daily',
    name: 'CDR历史数据',
    category: 'CDR',
    description: '存托凭证日线历史数据',
    apiEndpoint: 'stock_zh_a_cdr_daily',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '6位数字 (如: 688126)',
    exampleSymbol: '688126'
  },

  // ========== Hong Kong Stocks ==========
  {
    id: 'stock_hk_daily',
    name: '港股历史数据',
    category: '港股',
    description: '香港股票日线历史数据',
    apiEndpoint: 'stock_hk_daily',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '5位数字 (如: 00700)',
    exampleSymbol: '00700'
  },

  // ========== Chinese Indices ==========
  {
    id: 'index_zh_a_hist',
    name: '指数历史数据',
    category: '指数',
    description: '中国股票指数历史数据 (东方财富)',
    apiEndpoint: 'index_zh_a_hist',
    defaultParams: {
      period: 'daily'
    },
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '指数代码 (如: 000001 上证指数)',
    exampleSymbol: '000001'
  },
  {
    id: 'stock_zh_index_daily',
    name: '指数历史数据 (新浪)',
    category: '指数',
    description: '中国股票指数历史数据 (新浪财经)',
    apiEndpoint: 'stock_zh_index_daily',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: 'sz/sh + 指数代码 (如: sz399552)',
    exampleSymbol: 'sz399552'
  },
  {
    id: 'stock_zh_index_daily_tx',
    name: '指数历史数据 (腾讯)',
    category: '指数',
    description: '中国股票指数历史数据 (腾讯财经)',
    apiEndpoint: 'stock_zh_index_daily_tx',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: 'sh/sz + 指数代码 (如: sh000919)',
    exampleSymbol: 'sh000919'
  },
  {
    id: 'stock_zh_index_daily_em',
    name: '指数历史数据 (东财日线)',
    category: '指数',
    description: '中国股票指数历史数据 (东方财富)',
    apiEndpoint: 'stock_zh_index_daily_em',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '指数代码 (如: 000001)',
    exampleSymbol: '000001'
  },

  // ========== Hong Kong Indices ==========
  {
    id: 'stock_hk_index_daily_sina',
    name: '港股指数历史数据',
    category: '指数',
    description: '香港股票指数历史数据 (新浪)',
    apiEndpoint: 'stock_hk_index_daily_sina',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数代码 (如: HSI 恒生指数)',
    exampleSymbol: 'HSI'
  },
  {
    id: 'stock_hk_index_daily_em',
    name: '港股指数历史数据 (东财)',
    category: '指数',
    description: '香港股票指数历史数据 (东方财富)',
    apiEndpoint: 'stock_hk_index_daily_em',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数代码',
    exampleSymbol: 'HSI'
  },

  // ========== US Indices ==========
  {
    id: 'index_us_stock_sina',
    name: '美股指数历史数据',
    category: '指数',
    description: '美国股票指数历史数据 (新浪)',
    apiEndpoint: 'index_us_stock_sina',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数代码 (如: .INX 标普500)',
    exampleSymbol: '.INX'
  },

  // ========== Global Indices ==========
  {
    id: 'index_global_hist_em',
    name: '全球指数历史数据 (东财)',
    category: '指数',
    description: '全球股票指数历史数据 (东方财富)',
    apiEndpoint: 'index_global_hist_em',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数名称',
    exampleSymbol: '标普500'
  },
  {
    id: 'index_global_hist_sina',
    name: '全球指数历史数据 (新浪)',
    category: '指数',
    description: '全球股票指数历史数据 (新浪，限1000条)',
    apiEndpoint: 'index_global_hist_sina',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '指数名称',
    exampleSymbol: '标普500'
  },

  // ========== Funds & ETFs ==========
  {
    id: 'fund_etf_hist_sina',
    name: 'ETF历史数据 (新浪)',
    category: '基金',
    description: 'ETF基金历史数据 (新浪财经)',
    apiEndpoint: 'fund_etf_hist_sina',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '基金代码 (如: 510300)',
    exampleSymbol: '510300'
  },
  {
    id: 'fund_etf_hist_em',
    name: 'ETF历史数据 (东财)',
    category: '基金',
    description: 'ETF基金历史数据 (东方财富)',
    apiEndpoint: 'fund_etf_hist_em',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '基金代码 (如: 510300)',
    exampleSymbol: '510300'
  },
  {
    id: 'fund_etf_hist_min_em',
    name: 'ETF分钟数据 (东财)',
    category: '基金',
    description: 'ETF基金分钟级历史数据 (东方财富)',
    apiEndpoint: 'fund_etf_hist_min_em',
    defaultParams: {
      period: '60'
    },
    requiredParams: ['symbol', 'period'],
    symbolFormat: '基金代码 (如: 510300)',
    exampleSymbol: '510300'
  },
  {
    id: 'fund_lof_hist_em',
    name: 'LOF基金历史数据',
    category: '基金',
    description: 'LOF基金历史数据 (东方财富)',
    apiEndpoint: 'fund_lof_hist_em',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '基金代码',
    exampleSymbol: '163402'
  },

  // ========== Futures ==========
  {
    id: 'futures_zh_daily_sina',
    name: '期货历史数据',
    category: '期货',
    description: '国内期货日线历史数据 (新浪)',
    apiEndpoint: 'futures_zh_daily_sina',
    defaultParams: {},
    requiredParams: ['symbol'],
    symbolFormat: '合约代码 (如: RB0)',
    exampleSymbol: 'RB0'
  },
  {
    id: 'futures_zh_minute_sina',
    name: '期货分钟数据',
    category: '期货',
    description: '国内期货分钟级历史数据',
    apiEndpoint: 'futures_zh_minute_sina',
    defaultParams: {
      period: '60'
    },
    requiredParams: ['symbol', 'period'],
    symbolFormat: '合约代码',
    exampleSymbol: 'RB0'
  },
  {
    id: 'futures_foreign_hist',
    name: '外盘期货历史数据',
    category: '期货',
    description: '国外期货历史数据',
    apiEndpoint: 'futures_foreign_hist',
    defaultParams: {},
    requiredParams: ['symbol', 'start_date', 'end_date'],
    symbolFormat: '合约代码',
    exampleSymbol: 'CL'
  }
];

/**
 * Get data source config by ID
 */
export function getDataSourceConfig(id: string): DataSourceConfig | undefined {
  return DATA_SOURCES.find(ds => ds.id === id);
}

/**
 * Get data sources by category
 */
export function getDataSourcesByCategory(category: string): DataSourceConfig[] {
  return DATA_SOURCES.filter(ds => ds.category === category);
}

/**
 * Get all categories
 */
export function getDataSourceCategories(): string[] {
  const categories = new Set(DATA_SOURCES.map(ds => ds.category));
  return Array.from(categories);
}
