import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">StockViewer</h1>
          <p className="text-xl text-gray-600">Stock Analysis and Backtesting Platform</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Link
            href="/viewer"
            className="bg-white border-2 border-blue-500 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="text-blue-600 text-4xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold mb-2">Viewer</h2>
            <p className="text-gray-600">
              View stock charts with indicators, analyze price movements, and explore historical data.
            </p>
          </Link>

          <Link
            href="/backtest"
            className="bg-white border-2 border-orange-500 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="text-orange-600 text-4xl mb-4">🧪</div>
            <h2 className="text-2xl font-semibold mb-2">Backtest</h2>
            <p className="text-gray-600">
              Test your trading strategies against historical data with comprehensive performance metrics.
            </p>
          </Link>

          <Link
            href="/datasets"
            className="bg-white border-2 border-indigo-500 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="text-indigo-600 text-4xl mb-4">📁</div>
            <h2 className="text-2xl font-semibold mb-2">Datasets</h2>
            <p className="text-gray-600">
              Manage your stock datasets, add new stocks, update existing data, and organize by source.
            </p>
          </Link>
        </div>

        <div className="mt-12 text-center text-gray-500">
          <p>Select a section above to get started</p>
        </div>
      </div>
    </main>
  );
}

