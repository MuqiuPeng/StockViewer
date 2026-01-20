'use client';

import { signOut, useSession } from 'next-auth/react';

export default function PendingApprovalPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Account Pending Approval
          </h1>
        </div>

        <div className="text-gray-600 dark:text-gray-400 space-y-4">
          <p>
            Welcome, <span className="font-medium text-gray-900 dark:text-white">{session?.user?.name || 'User'}</span>!
          </p>
          <p>
            Your account has been created but requires administrator approval before you can access StockViewer.
          </p>
          <p className="text-sm">
            Please wait for an administrator to review and approve your account. You will be able to access the application once approved.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Check Status
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
