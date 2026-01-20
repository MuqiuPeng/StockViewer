'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface TicketUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Ticket {
  id: string;
  type: string;
  status: string;
  payload: {
    stockId: string;
    symbol: string;
    dataSource: string;
    reason?: string;
  };
  user: TicketUser;
  reviewer?: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface TicketStats {
  PENDING?: number;
  APPROVED?: number;
  REJECTED?: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/admin/tickets?${params}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          router.push('/');
          return;
        }
        throw new Error(data.message || 'Failed to fetch tickets');
      }

      setTickets(data.tickets);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      fetchTickets();
    }
  }, [status, router, fetchTickets]);

  const handleAction = async (ticketId: string, action: 'approve' | 'reject') => {
    const note = action === 'reject'
      ? prompt('Enter rejection reason (optional):')
      : null;

    try {
      setActionLoading(ticketId);

      const response = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to process ticket');
      }

      // Refresh tickets
      fetchTickets();

      // Show result
      if (action === 'approve' && data.refreshResult) {
        if (data.refreshResult.success) {
          alert(`Approved! ${data.refreshResult.message}`);
        } else {
          alert(`Approved, but refresh failed: ${data.refreshResult.error}`);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'APPROVED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage user tickets and requests
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div
            className={`p-4 rounded-lg cursor-pointer transition-colors ${
              statusFilter === 'PENDING'
                ? 'bg-yellow-100 dark:bg-yellow-900 ring-2 ring-yellow-500'
                : 'bg-white dark:bg-gray-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/50'
            }`}
            onClick={() => setStatusFilter('PENDING')}
          >
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.PENDING || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
          </div>
          <div
            className={`p-4 rounded-lg cursor-pointer transition-colors ${
              statusFilter === 'APPROVED'
                ? 'bg-green-100 dark:bg-green-900 ring-2 ring-green-500'
                : 'bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/50'
            }`}
            onClick={() => setStatusFilter('APPROVED')}
          >
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.APPROVED || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Approved</div>
          </div>
          <div
            className={`p-4 rounded-lg cursor-pointer transition-colors ${
              statusFilter === 'REJECTED'
                ? 'bg-red-100 dark:bg-red-900 ring-2 ring-red-500'
                : 'bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/50'
            }`}
            onClick={() => setStatusFilter('REJECTED')}
          >
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.REJECTED || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Rejected</div>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="mb-4 flex gap-2">
          <button
            className={`px-3 py-1 rounded text-sm ${
              !statusFilter
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            onClick={() => setStatusFilter('')}
          >
            All
          </button>
        </div>

        {/* Tickets Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No tickets found
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {ticket.user.image && (
                          <img
                            className="h-8 w-8 rounded-full mr-3"
                            src={ticket.user.image}
                            alt=""
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {ticket.user.name || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {ticket.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {ticket.type === 'FULL_REFRESH' ? 'Full Refresh' : ticket.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {ticket.payload.symbol} ({ticket.payload.dataSource})
                      </div>
                      {ticket.payload.reason && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Reason: {ticket.payload.reason}
                        </div>
                      )}
                      {ticket.reviewNote && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Note: {ticket.reviewNote}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {ticket.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                            onClick={() => handleAction(ticket.id, 'approve')}
                            disabled={actionLoading === ticket.id}
                          >
                            {actionLoading === ticket.id ? '...' : 'Approve'}
                          </button>
                          <button
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                            onClick={() => handleAction(ticket.id, 'reject')}
                            disabled={actionLoading === ticket.id}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {ticket.status !== 'PENDING' && ticket.reviewer && (
                        <span className="text-gray-500 dark:text-gray-400">
                          by {ticket.reviewer}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Back link */}
        <div className="mt-6">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            &larr; Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
