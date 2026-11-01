'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function SetupPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [csvPath, setCsvPath] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if setup is already complete
  useEffect(() => {
    async function checkSetup() {
      if (status === 'loading') return;

      if (!session) {
        router.push('/auth/signin');
        return;
      }

      try {
        const res = await fetch('/api/user-settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.setupComplete) {
            router.push('/');
            return;
          }
          // Pre-fill with existing path if any
          if (data.settings?.csvDataPath) {
            setCsvPath(data.settings.csvDataPath);
          }
        }
      } catch (err) {
        console.error('Error checking setup:', err);
      }
      setChecking(false);
    }

    checkSetup();
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!csvPath.trim()) {
      setError('Please enter a valid folder path');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvDataPath: csvPath.trim(),
          setupComplete: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Failed to save settings');
        setLoading(false);
        return;
      }

      // Redirect to home page
      router.push('/');
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      setLoading(false);
    }
  };

  if (status === 'loading' || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome to StockViewer
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Let's set up your local data folder before getting started.
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
            How it works
          </h2>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
            <li>• Stock data (CSV files) is stored on your local machine</li>
            <li>• Your indicators, strategies, and settings sync to the cloud</li>
            <li>• You can restore your setup on any machine by re-fetching data</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            CSV Data Folder Path
          </label>
          <input
            type="text"
            value={csvPath}
            onChange={(e) => setCsvPath(e.target.value)}
            placeholder="/path/to/your/stock-data"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder-gray-400 dark:placeholder-gray-500"
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Enter the absolute path where you want to store your stock CSV files.
            The folder will be created if it doesn't exist.
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                     text-white font-medium rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {loading ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Example paths:
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 font-mono">
            <p>macOS: /Users/yourname/stock-data</p>
            <p>Linux: /home/yourname/stock-data</p>
            <p>Windows: C:\Users\yourname\stock-data</p>
          </div>
        </div>
      </div>
    </div>
  );
}
