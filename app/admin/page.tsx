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

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  status: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  accounts: { provider: string; providerAccountId: string }[];
}

interface UserStats {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
}

type Tab = 'tickets' | 'users';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Admin verification state - null means not yet checked
  const [isAdminVerified, setIsAdminVerified] = useState<boolean | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('users');

  // Tickets state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketStats, setTicketStats] = useState<TicketStats>({});
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('PENDING');
  const [ticketsLoading, setTicketsLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [userStats, setUserStats] = useState<UserStats>({ PENDING: 0, APPROVED: 0, REJECTED: 0 });
  const [userStatusFilter, setUserStatusFilter] = useState<string>('PENDING');
  const [usersLoading, setUsersLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setTicketsLoading(true);
      const params = new URLSearchParams();
      if (ticketStatusFilter) {
        params.set('status', ticketStatusFilter);
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
      setTicketStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setTicketsLoading(false);
    }
  }, [ticketStatusFilter, router]);

  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const params = new URLSearchParams();
      if (userStatusFilter) {
        params.set('status', userStatusFilter);
      }

      const response = await fetch(`/api/admin/users?${params}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          router.push('/');
          return;
        }
        throw new Error(data.message || 'Failed to fetch users');
      }

      setUsers(data.users);
      setUserStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUsersLoading(false);
    }
  }, [userStatusFilter, router]);

  // First, verify admin status before loading any data
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      // Check admin status first
      fetch('/api/admin/status')
        .then((res) => res.json())
        .then((data) => {
          if (!data.isAdmin) {
            // Not admin - redirect immediately
            router.replace('/');
          } else {
            // Admin verified - allow rendering
            setIsAdminVerified(true);
          }
        })
        .catch(() => {
          // Error checking admin status - redirect for safety
          router.replace('/');
        });
    }
  }, [status, router]);

  // Only load data after admin is verified
  useEffect(() => {
    if (isAdminVerified) {
      fetchTickets();
      fetchUsers();
    }
  }, [isAdminVerified, fetchTickets, fetchUsers]);

  const handleTicketAction = async (ticketId: string, action: 'approve' | 'reject') => {
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

      fetchTickets();

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

  const handleUserAction = async (userId: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(userId);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action === 'approve' ? 'APPROVED' : 'REJECTED' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    if (!confirm(`Are you sure you want to ${currentIsAdmin ? 'revoke' : 'grant'} admin privileges?`)) {
      return;
    }

    try {
      setActionLoading(userId);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string | null) => {
    if (!confirm(`Are you sure you want to delete user "${userName || 'Unknown'}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(userId);

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers();
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

  // Show nothing while checking authentication or admin status
  // This prevents any admin content from flashing before redirect
  if (status === 'loading' || isAdminVerified === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Not admin - show nothing (redirect is in progress)
  if (!isAdminVerified) {
    return null;
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
            Manage users and tickets
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex gap-4">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Users
              {userStats.PENDING > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {userStats.PENDING}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tickets')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tickets'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Tickets
              {(ticketStats.PENDING || 0) > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {ticketStats.PENDING}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {/* User Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  userStatusFilter === 'PENDING'
                    ? 'bg-yellow-100 dark:bg-yellow-900 ring-2 ring-yellow-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/50'
                }`}
                onClick={() => setUserStatusFilter('PENDING')}
              >
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {userStats.PENDING}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
              </div>
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  userStatusFilter === 'APPROVED'
                    ? 'bg-green-100 dark:bg-green-900 ring-2 ring-green-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/50'
                }`}
                onClick={() => setUserStatusFilter('APPROVED')}
              >
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {userStats.APPROVED}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Approved</div>
              </div>
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  userStatusFilter === 'REJECTED'
                    ? 'bg-red-100 dark:bg-red-900 ring-2 ring-red-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/50'
                }`}
                onClick={() => setUserStatusFilter('REJECTED')}
              >
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {userStats.REJECTED}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Rejected</div>
              </div>
            </div>

            {/* All filter */}
            <div className="mb-4 flex gap-2">
              <button
                className={`px-3 py-1 rounded text-sm ${
                  !userStatusFilter
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                onClick={() => setUserStatusFilter('')}
              >
                All
              </button>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              {usersLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {user.image && (
                                <img
                                  className="h-8 w-8 rounded-full mr-3"
                                  src={user.image}
                                  alt=""
                                />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                  {user.name || 'Unknown'}
                                  {user.isSuperAdmin && (
                                    <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                                      Super
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {user.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.isAdmin || user.isSuperAdmin) ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                Admin
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(
                                user.status
                              )}`}
                            >
                              {user.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              {/* Status actions */}
                              {user.status === 'PENDING' && (
                                <>
                                  <button
                                    className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                    onClick={() => handleUserAction(user.id, 'approve')}
                                    disabled={actionLoading === user.id}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                    onClick={() => handleUserAction(user.id, 'reject')}
                                    disabled={actionLoading === user.id}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {user.status === 'APPROVED' && !user.isSuperAdmin && (
                                <button
                                  className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 disabled:opacity-50"
                                  onClick={() => handleUserAction(user.id, 'reject')}
                                  disabled={actionLoading === user.id}
                                >
                                  Revoke
                                </button>
                              )}
                              {user.status === 'REJECTED' && (
                                <button
                                  className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                  onClick={() => handleUserAction(user.id, 'approve')}
                                  disabled={actionLoading === user.id}
                                >
                                  Approve
                                </button>
                              )}

                              {/* Admin toggle - only for super admin, not for self or other super admin */}
                              {!user.isSuperAdmin && (
                                <button
                                  className={`${
                                    user.isAdmin
                                      ? 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300'
                                      : 'text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300'
                                  } disabled:opacity-50`}
                                  onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                                  disabled={actionLoading === user.id}
                                  title={user.isAdmin ? 'Remove admin' : 'Make admin'}
                                >
                                  {user.isAdmin ? '−Admin' : '+Admin'}
                                </button>
                              )}

                              {/* Delete - not for super admin */}
                              {!user.isSuperAdmin && (
                                <button
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                  onClick={() => handleDeleteUser(user.id, user.name)}
                                  disabled={actionLoading === user.id}
                                  title="Delete user"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Tickets Tab */}
        {activeTab === 'tickets' && (
          <>
            {/* Ticket Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  ticketStatusFilter === 'PENDING'
                    ? 'bg-yellow-100 dark:bg-yellow-900 ring-2 ring-yellow-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/50'
                }`}
                onClick={() => setTicketStatusFilter('PENDING')}
              >
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {ticketStats.PENDING || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
              </div>
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  ticketStatusFilter === 'APPROVED'
                    ? 'bg-green-100 dark:bg-green-900 ring-2 ring-green-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/50'
                }`}
                onClick={() => setTicketStatusFilter('APPROVED')}
              >
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {ticketStats.APPROVED || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Approved</div>
              </div>
              <div
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  ticketStatusFilter === 'REJECTED'
                    ? 'bg-red-100 dark:bg-red-900 ring-2 ring-red-500'
                    : 'bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/50'
                }`}
                onClick={() => setTicketStatusFilter('REJECTED')}
              >
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {ticketStats.REJECTED || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Rejected</div>
              </div>
            </div>

            {/* All filter */}
            <div className="mb-4 flex gap-2">
              <button
                className={`px-3 py-1 rounded text-sm ${
                  !ticketStatusFilter
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                onClick={() => setTicketStatusFilter('')}
              >
                All
              </button>
            </div>

            {/* Tickets Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              {ticketsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
              ) : (
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
                                  onClick={() => handleTicketAction(ticket.id, 'approve')}
                                  disabled={actionLoading === ticket.id}
                                >
                                  {actionLoading === ticket.id ? '...' : 'Approve'}
                                </button>
                                <button
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                  onClick={() => handleTicketAction(ticket.id, 'reject')}
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
              )}
            </div>
          </>
        )}

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
