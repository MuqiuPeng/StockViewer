import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 text-gray-900">
            Stock Viewer
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Chinese A-Share Stock Analysis Platform
          </p>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Analyze stock charts, create custom indicators, and backtest trading strategies with Python
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          <Link
            href="/viewer"
            className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Viewer</h2>
            <p className="text-gray-600">
              Visualize stock data with interactive charts and apply custom indicators
            </p>
          </Link>

          <Link
            href="/backtest"
            className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="text-4xl mb-4">📈</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Backtest</h2>
            <p className="text-gray-600">
              Test your trading strategies on historical data with detailed performance metrics
            </p>
          </Link>

          <Link
            href="/datasets"
            className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="text-4xl mb-4">📁</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Datasets</h2>
            <p className="text-gray-600">
              Manage your stock datasets and organize them into groups
            </p>
          </Link>
        </div>

        <div className="bg-white rounded-lg p-8 max-w-5xl mx-auto shadow-md border border-gray-200">
          <h3 className="text-2xl font-bold text-center mb-6 text-gray-900">
            Features
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Custom Indicators</h4>
              <p className="text-gray-600 text-sm">
                Create technical indicators using Python and MyTT library
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Strategy Backtesting</h4>
              <p className="text-gray-600 text-sm">
                Backtest single stock and portfolio strategies with historical data
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">External Datasets</h4>
              <p className="text-gray-600 text-sm">
                Compare against market indices and use reference data in your analysis
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Backtest History</h4>
              <p className="text-gray-600 text-sm">
                Track and organize your backtest results with notes and tags
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

