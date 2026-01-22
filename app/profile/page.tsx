'use client';

import { useSession, signOut } from 'next-auth/react';

export default function ProfilePage() {
  const { data: session, status } = useSession();

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
