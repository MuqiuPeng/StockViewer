'use client';

import CredentialManager from '@/components/admin/CredentialManager';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { logAction } from '@/lib/client-logger';

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
  statusReviewedAt: string | null;
  statusReviewNote: string | null;
  statusReviewer: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  accounts: { provider: string; providerAccountId: string }[];
}

interface UserStats {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
}

interface CustomDataset {
  id: string;
  symbol: string;
  name: string;
  dataSource: string;
  rowCount: number;
  firstDate: string | null;
  lastDate: string | null;
  createdAt: string;
  uploader: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  postCount: number;
}

interface SystemLog {
  id: string;
  level: string;
  source: string;
  action: string;
  message: string;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
}

interface LogStats {
  INFO: number;
  WARN: number;
  ERROR: number;
}

type Tab = 'tickets' | 'users' | 'datasets' | 'logs' | 'credentials';

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
  const [userStatusFilter, setUserStatusFilter] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);

  // Datasets state
  const [datasets, setDatasets] = useState<CustomDataset[]>([]);
  const [datasetsTotal, setDatasetsTotal] = useState(0);
  const [datasetsSearch, setDatasetsSearch] = useState('');
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  // Logs state
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logStats, setLogStats] = useState<LogStats>({ INFO: 0, WARN: 0, ERROR: 0 });
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('');
  const [logSourceFilter, setLogSourceFilter] = useState<string>('');
  const [logSearch, setLogSearch] = useState('');
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logsPerPage, setLogsPerPage] = useState(50);
  const [logAutoRefresh, setLogAutoRefresh] = useState(false);
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const logAutoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          console.error('Tickets fetch: 403 Forbidden');
          setError('Access denied');
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
  }, [ticketStatusFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);

      const response = await fetch('/api/admin/users');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          console.error('Users fetch: 403 Forbidden');
          setError('Access denied');
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
  }, []);

  const fetchDatasets = useCallback(async () => {
    try {
      setDatasetsLoading(true);
      const params = new URLSearchParams();
      if (datasetsSearch) {
        params.set('search', datasetsSearch);
      }

      const response = await fetch(`/api/admin/datasets?${params}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          console.error('Datasets fetch: 403 Forbidden');
          setError('Access denied');
          return;
        }
        throw new Error(data.message || 'Failed to fetch datasets');
      }

      setDatasets(data.datasets);
      setDatasetsTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDatasetsLoading(false);
    }
  }, [datasetsSearch]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(logsPage));
      params.set('limit', String(logsPerPage));
      if (logLevelFilter) params.set('level', logLevelFilter);
      if (logSourceFilter) params.set('source', logSourceFilter);
      if (logSearch) params.set('search', logSearch);
      if (logStartDate) params.set('startDate', logStartDate);
      if (logEndDate) params.set('endDate', logEndDate);

      const response = await fetch(`/api/admin/logs?${params}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setError('Access denied');
          return;
        }
        throw new Error(data.message || 'Failed to fetch logs');
      }

      setLogs(data.logs);
      setLogStats(data.stats);
      setLogsTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLogsLoading(false);
    }
  }, [logsPage, logsPerPage, logLevelFilter, logSourceFilter, logSearch, logStartDate, logEndDate]);

  // First, verify admin status before loading any data
  useEffect(() => {
    // Skip if already verified or currently checking
    if (isAdminVerified !== null) {
      return;
    }

    if (status === 'unauthenticated') {
      router.replace('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      // Check admin status first
      fetch('/api/admin/status')
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          console.log('Admin status response:', data);
          if (!data.isAdmin) {
            // Not admin - redirect immediately
            console.log('Not admin, redirecting. Reason:', data.reason);
            setIsAdminVerified(false);
            router.replace('/');
          } else {
            // Admin verified - allow rendering
            setIsAdminVerified(true);
          }
        })
        .catch((err) => {
          // Error checking admin status - redirect for safety
          console.error('Error checking admin status:', err);
          setIsAdminVerified(false);
          router.replace('/');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Only load data after admin is verified
  useEffect(() => {
    if (isAdminVerified) {
      fetchTickets();
      fetchUsers();
      fetchDatasets();
      fetchLogs();
    }
  }, [isAdminVerified, fetchTickets, fetchUsers, fetchDatasets, fetchLogs]);

  // Refetch logs when filters/page change
  useEffect(() => {
    if (isAdminVerified && activeTab === 'logs') {
      fetchLogs();
    }
  }, [logsPage, logsPerPage, logLevelFilter, logSourceFilter, logSearch, logStartDate, logEndDate, isAdminVerified, activeTab, fetchLogs]);

  // Auto-refresh logs
  useEffect(() => {
    if (logAutoRefresh && activeTab === 'logs' && isAdminVerified) {
      logAutoRefreshRef.current = setInterval(() => { fetchLogs(); }, 10000);
    }
    return () => {
      if (logAutoRefreshRef.current) {
        clearInterval(logAutoRefreshRef.current);
        logAutoRefreshRef.current = null;
      }
    };
  }, [logAutoRefresh, activeTab, isAdminVerified, fetchLogs]);

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

      logAction('admin_review_ticket', 'Reviewed ticket', { ticketId, action });
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

      logAction('admin_update_user', 'Updated user status', { userId, action });
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

      logAction('admin_toggle_admin', 'Toggled admin', { userId });
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

  const handleDeleteDataset = async (datasetId: string, symbol: string) => {
    if (!confirm(`Are you sure you want to delete dataset "${symbol}"? This will remove all price data. Share posts will remain but import will be disabled.`)) {
      return;
    }

    try {
      setActionLoading(datasetId);

      const response = await fetch('/api/admin/datasets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: datasetId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete dataset');
      }

      logAction('admin_delete_dataset', 'Deleted dataset', { symbol });
      alert(data.message);
      fetchDatasets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteLogs = async (olderThanDays: number) => {
    const label = olderThanDays === 0 ? 'ALL logs' : `logs older than ${olderThanDays} day(s)`;
    if (!confirm(`Are you sure you want to delete ${label}? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading('delete-logs');
      const response = await fetch(`/api/admin/logs?olderThanDays=${olderThanDays}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete logs');
      }
      logAction('admin_delete_logs', 'Deleted logs', { olderThanDays });
      alert(`Deleted ${data.deleted} log(s)`);
      fetchLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
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
            <button
              onClick={() => setActiveTab('datasets')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'datasets'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Custom Datasets
              {datasetsTotal > 0 && (
                <span className="ml-2 bg-gray-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {datasetsTotal}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Logs
              {logStats.ERROR > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {logStats.ERROR}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('credentials')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'credentials'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Credentials
            </button>
          </nav>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {/* Stats Summary */}
            <div className="flex items-center gap-4 mb-4 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Total <span className="font-semibold text-gray-900 dark:text-white">{userStats.PENDING + userStats.APPROVED + userStats.REJECTED}</span>
              </span>
              <span className="text-yellow-600 dark:text-yellow-400">
                Pending <span className="font-semibold">{userStats.PENDING}</span>
              </span>
              <span className="text-green-600 dark:text-green-400">
                Approved <span className="font-semibold">{userStats.APPROVED}</span>
              </span>
              <span className="text-red-600 dark:text-red-400">
                Rejected <span className="font-semibold">{userStats.REJECTED}</span>
              </span>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-3 mb-4">
              {/* Search */}
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Role Filter */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>

              {/* Status Filter */}
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {/* Clear filters */}
              {(userSearch || userRoleFilter || userStatusFilter) && (
                <button
                  onClick={() => {
                    setUserSearch('');
                    setUserRoleFilter('');
                    setUserStatusFilter('');
                  }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear
                </button>
              )}
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
                        Reviewed By
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
                    {(() => {
                      const filteredUsers = users.filter((u) => {
                        // Search filter
                        if (userSearch) {
                          const q = userSearch.toLowerCase();
                          const nameMatch = u.name?.toLowerCase().includes(q);
                          const emailMatch = u.email?.toLowerCase().includes(q);
                          if (!nameMatch && !emailMatch) return false;
                        }
                        // Role filter
                        if (userRoleFilter === 'super_admin' && !u.isSuperAdmin) return false;
                        if (userRoleFilter === 'admin' && !u.isAdmin && !u.isSuperAdmin) return false;
                        if (userRoleFilter === 'user' && (u.isAdmin || u.isSuperAdmin)) return false;
                        // Status filter
                        if (userStatusFilter && u.status !== userStatusFilter) return false;
                        return true;
                      });

                      if (filteredUsers.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                              No users found
                            </td>
                          </tr>
                        );
                      }

                      return filteredUsers.map((user) => (
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
                          <td className="px-6 py-4 whitespace-nowrap">
                            {user.statusReviewer ? (
                              <div className="flex items-center">
                                {user.statusReviewer.image && (
                                  <img
                                    className="h-6 w-6 rounded-full mr-2"
                                    src={user.statusReviewer.image}
                                    alt=""
                                  />
                                )}
                                <div>
                                  <div className="text-sm text-gray-900 dark:text-white">
                                    {user.statusReviewer.name || 'Unknown'}
                                  </div>
                                  {user.statusReviewedAt && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatDate(user.statusReviewedAt)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                            )}
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
                      ));
                    })()}
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
                              {ticket.type === 'FULL_REFRESH' ? 'Full Refresh' :
                               ticket.type === 'CUSTOM_DATA' ? 'Custom Data' :
                               ticket.type === 'DELETE_DATASET' ? 'Delete Dataset' : ticket.type}
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

        {/* Datasets Tab */}
        {activeTab === 'datasets' && (
          <>
            {/* Search */}
            <div className="mb-6">
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Search by symbol or name..."
                  value={datasetsSearch}
                  onChange={(e) => setDatasetsSearch(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => fetchDatasets()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Datasets Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              {datasetsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Symbol
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Rows
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date Range
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Uploader
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Posts
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
                    {datasets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                          No custom datasets found
                        </td>
                      </tr>
                    ) : (
                      datasets.map((dataset) => (
                        <tr key={dataset.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {dataset.symbol}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-white">
                              {dataset.name}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {dataset.rowCount.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {dataset.firstDate && dataset.lastDate
                                ? `${new Date(dataset.firstDate).toLocaleDateString()} - ${new Date(dataset.lastDate).toLocaleDateString()}`
                                : '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {dataset.uploader ? (
                              <div className="flex items-center">
                                {dataset.uploader.image && (
                                  <img
                                    className="h-6 w-6 rounded-full mr-2"
                                    src={dataset.uploader.image}
                                    alt=""
                                  />
                                )}
                                <div>
                                  <div className="text-sm text-gray-900 dark:text-white">
                                    {dataset.uploader.name || 'Unknown'}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {dataset.uploader.email}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">Unknown</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {dataset.postCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(dataset.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                              onClick={() => handleDeleteDataset(dataset.id, dataset.symbol)}
                              disabled={actionLoading === dataset.id}
                            >
                              {actionLoading === dataset.id ? '...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total count */}
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Total: {datasetsTotal} custom dataset{datasetsTotal !== 1 ? 's' : ''}
            </div>
          </>
        )}

        {/* Logs Tab */}
        {activeTab === 'credentials' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">
              Provider Credentials
            </h2>
            <CredentialManager />
          </div>
        )}

        {activeTab === 'logs' && (
          <>
            {/* Stats Summary */}
            <div className="flex items-center gap-4 mb-4 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Total <span className="font-semibold text-gray-900 dark:text-white">{logsTotal}</span>
              </span>
              <span className="text-green-600 dark:text-green-400">
                INFO <span className="font-semibold">{logStats.INFO}</span>
              </span>
              <span className="text-yellow-600 dark:text-yellow-400">
                WARN <span className="font-semibold">{logStats.WARN}</span>
              </span>
              <span className="text-red-600 dark:text-red-400">
                ERROR <span className="font-semibold">{logStats.ERROR}</span>
              </span>
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logAutoRefresh}
                  onChange={(e) => setLogAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
            </div>

            {/* Filters Row 1 */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <select
                value={logLevelFilter}
                onChange={(e) => { setLogLevelFilter(e.target.value); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                <option value="INFO">Info</option>
                <option value="WARN">Warning</option>
                <option value="ERROR">Error</option>
              </select>
              <select
                value={logSourceFilter}
                onChange={(e) => { setLogSourceFilter(e.target.value); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sources</option>
                <option value="FRONTEND">Frontend</option>
                <option value="API">API</option>
                <option value="DATA_SERVICE">Data Service</option>
              </select>
              <input
                type="text"
                placeholder="Search message..."
                value={logSearch}
                onChange={(e) => { setLogSearch(e.target.value); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
              />
              <input
                type="date"
                value={logStartDate}
                onChange={(e) => { setLogStartDate(e.target.value); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Start Date"
              />
              <span className="text-gray-400 text-sm">-</span>
              <input
                type="date"
                value={logEndDate}
                onChange={(e) => { setLogEndDate(e.target.value); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="End Date"
              />
              {(logLevelFilter || logSourceFilter || logSearch || logStartDate || logEndDate) && (
                <button
                  onClick={() => { setLogLevelFilter(''); setLogSourceFilter(''); setLogSearch(''); setLogStartDate(''); setLogEndDate(''); setLogsPage(1); }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filters Row 2: Actions */}
            <div className="flex items-center gap-3 mb-4">
              <select
                value={logsPerPage}
                onChange={(e) => { setLogsPerPage(Number(e.target.value)); setLogsPage(1); }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <button
                onClick={() => fetchLogs()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Refresh
              </button>
              <div className="flex-1" />
              <div className="relative group">
                <button className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                  Delete Logs ▾
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg hidden group-hover:block z-10">
                  {[30, 7, 1, 0].map((days) => (
                    <button
                      key={days}
                      onClick={() => handleDeleteLogs(days)}
                      disabled={actionLoading === 'delete-logs'}
                      className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${days === 0 ? 'text-red-600 font-medium' : ''}`}
                    >
                      {days === 0 ? 'Delete ALL logs' : `Older than ${days} day${days > 1 ? 's' : ''}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              {logsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">No logs found</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[150px]">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[70px]">
                        Level
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[100px]">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[150px]">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Message
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[120px]">
                        User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="group">
                        <td colSpan={6} className="p-0">
                          {/* Main row */}
                          <div
                            className={`grid cursor-pointer transition-colors ${
                              log.level === 'ERROR'
                                ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : log.level === 'WARN'
                                ? 'hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            }`}
                            style={{ gridTemplateColumns: '150px 70px 100px 150px 1fr 120px' }}
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          >
                            <div className="px-4 py-3 whitespace-nowrap">
                              <div className="text-xs text-gray-500 dark:text-gray-400">{relativeTime(log.createdAt)}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.createdAt)}</div>
                            </div>
                            <div className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                log.level === 'ERROR' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                                log.level === 'WARN' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' :
                                'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                              }`}>
                                {log.level}
                              </span>
                            </div>
                            <div className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                log.source === 'API' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                                log.source === 'FRONTEND' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' :
                                'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                              }`}>
                                {log.source === 'DATA_SERVICE' ? 'DATA SVC' : log.source}
                              </span>
                            </div>
                            <div className="px-4 py-3">
                              <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                {log.action}
                              </code>
                            </div>
                            <div className="px-4 py-3 min-w-0">
                              <div className="text-sm truncate">{log.message}</div>
                            </div>
                            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 truncate">
                              {log.user?.name || log.user?.email || '--'}
                            </div>
                          </div>
                          {/* Expanded detail */}
                          {expandedLogId === log.id && (
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
                              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                                <div>
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Log ID</span>
                                  <div className="font-mono text-xs text-gray-700 dark:text-gray-300">{log.id}</div>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</span>
                                  <div className="text-xs text-gray-700 dark:text-gray-300">{new Date(log.createdAt).toISOString()}</div>
                                </div>
                              </div>
                              <div className="mb-3">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Full Message</span>
                                <div className="mt-1 text-sm whitespace-pre-wrap bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-3">
                                  {log.message}
                                </div>
                              </div>
                              {log.metadata && (
                                <div className="mb-3">
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Metadata</span>
                                  {/* Stack trace gets special treatment */}
                                  {!!(log.metadata as Record<string, unknown>).stack && (
                                    <div className="mt-1 mb-2">
                                      <span className="text-xs font-medium text-red-500 dark:text-red-400 uppercase">Stack Trace</span>
                                      <pre className="mt-1 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                                        {String((log.metadata as Record<string, unknown>).stack)}
                                      </pre>
                                    </div>
                                  )}
                                  <pre className="mt-1 text-xs bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-3 overflow-x-auto">
                                    {JSON.stringify(
                                      Object.fromEntries(
                                        Object.entries(log.metadata as Record<string, unknown>).filter(([k]) => k !== 'stack')
                                      ),
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {logsTotal > 0
                  ? `Showing ${(logsPage - 1) * logsPerPage + 1}-${Math.min(logsPage * logsPerPage, logsTotal)} of ${logsTotal}`
                  : 'No logs'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogsPage(Math.max(1, logsPage - 1))}
                  disabled={logsPage <= 1}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {logsPage} / {Math.max(1, Math.ceil(logsTotal / logsPerPage))}
                </span>
                <button
                  onClick={() => setLogsPage(logsPage + 1)}
                  disabled={logsPage >= Math.ceil(logsTotal / logsPerPage)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
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
