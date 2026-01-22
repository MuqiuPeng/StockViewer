'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';

interface ProfileStats {
  indicators: {
    created: number;
    uniqueUsers: number;
    totalImports: number;
  };
  strategies: {
    created: number;
    uniqueUsers: number;
    totalImports: number;
  };
  stockGroups: {
    created: number;
    uniqueUsers: number;
    totalImports: number;
  };
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadStats();
    }
  }, [session]);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/profile/stats');
      const data = await response.json();
      if (!data.error) {
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14 flex items-center justify-center">
        <div className="text-gray-500">Please sign in to view your profile.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold dark:text-white mb-6">Profile</h1>

        {/* User Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-4">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-medium">
                {session.user.name?.charAt(0) || session.user.email?.charAt(0) || 'U'}
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold dark:text-white">
                {session.user.name || 'User'}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {session.user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Resource Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h3 className="text-lg font-semibold dark:text-white mb-4">My Resources</h3>
          {statsLoading ? (
            <div className="text-gray-500 dark:text-gray-400">Loading stats...</div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-4">
              {/* Indicators */}
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.indicators.created}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Indicators</div>
                {stats.indicators.uniqueUsers > 0 && (
                  <div className="text-xs text-purple-500 dark:text-purple-400 mt-2">
                    {stats.indicators.uniqueUsers} user{stats.indicators.uniqueUsers !== 1 ? 's' : ''} imported
                  </div>
                )}
              </div>

              {/* Strategies */}
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.strategies.created}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Strategies</div>
                {stats.strategies.uniqueUsers > 0 && (
                  <div className="text-xs text-blue-500 dark:text-blue-400 mt-2">
                    {stats.strategies.uniqueUsers} user{stats.strategies.uniqueUsers !== 1 ? 's' : ''} imported
                  </div>
                )}
              </div>

              {/* Stock Groups */}
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {stats.stockGroups.created}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Stock Groups</div>
                {stats.stockGroups.uniqueUsers > 0 && (
                  <div className="text-xs text-green-500 dark:text-green-400 mt-2">
                    {stats.stockGroups.uniqueUsers} user{stats.stockGroups.uniqueUsers !== 1 ? 's' : ''} imported
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 dark:text-gray-400">Failed to load stats</div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full px-6 py-4 text-left text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
