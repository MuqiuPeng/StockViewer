'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  type: 'FULL_REFRESH' | 'CUSTOM_DATA' | 'DELETE_DATASET';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payload: {
    stockId?: string;
    symbol?: string;
    dataSource?: string;
    reason?: string;
    name?: string;
    description?: string;
  };
  reviewNote: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Invitation {
  id: string;
  group: {
    id: string;
    name: string;
    description: string | null;
    owner: {
      id: string;
      name: string | null;
      image: string | null;
    };
    memberCount: number;
  };
  createdAt: string;
}

export default function NotificationsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'tickets' | 'invitations'>('all');

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications');
      const data = await response.json();
      if (!data.error) {
        setTickets(data.tickets || []);
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvitationAction = async (invitationId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Operation failed');
      } else {
        loadNotifications();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const getTicketTypeLabel = (type: string) => {
    switch (type) {
      case 'FULL_REFRESH': return 'Full Refresh';
      case 'CUSTOM_DATA': return 'Custom Data Upload';
      case 'DELETE_DATASET': return 'Delete Dataset';
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded">Pending</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">Approved</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">Rejected</span>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredTickets = activeTab === 'invitations' ? [] : tickets;
  const filteredInvitations = activeTab === 'tickets' ? [] : invitations;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold dark:text-white mb-6">Notifications</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm rounded-lg ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 text-sm rounded-lg ${
              activeTab === 'tickets'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            Tickets ({tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 text-sm rounded-lg relative ${
              activeTab === 'invitations'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            Invitations
            {invitations.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {invitations.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            {/* Group Invitations */}
            {filteredInvitations.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Group Invitations
                </h2>
                {filteredInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium dark:text-white">{invitation.group.name}</h3>
                        {invitation.group.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {invitation.group.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <span>From: {invitation.group.owner.name || 'Unknown'}</span>
                          <span>{invitation.group.memberCount} members</span>
                          <span>{formatDate(invitation.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'accept')}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'reject')}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tickets */}
            {filteredTickets.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Ticket History
                </h2>
                {filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium dark:text-white">
                            {getTicketTypeLabel(ticket.type)}
                          </span>
                          {getStatusBadge(ticket.status)}
                        </div>
                        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {ticket.type === 'FULL_REFRESH' && (
                            <p>
                              Stock: {ticket.payload.symbol} ({ticket.payload.dataSource})
                              {ticket.payload.reason && <span className="block">Reason: {ticket.payload.reason}</span>}
                            </p>
                          )}
                          {ticket.type === 'CUSTOM_DATA' && (
                            <p>
                              Dataset: {ticket.payload.name}
                              {ticket.payload.description && <span className="block">{ticket.payload.description}</span>}
                            </p>
                          )}
                          {ticket.type === 'DELETE_DATASET' && (
                            <p>
                              Dataset: {ticket.payload.symbol} ({ticket.payload.dataSource})
                              {ticket.payload.reason && <span className="block">Reason: {ticket.payload.reason}</span>}
                            </p>
                          )}
                        </div>
                        {ticket.reviewNote && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Admin note: </span>
                            <span className="text-gray-700 dark:text-gray-300">{ticket.reviewNote}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>Created: {formatDate(ticket.createdAt)}</span>
                          {ticket.reviewedAt && (
                            <>
                              <span>Reviewed: {formatDate(ticket.reviewedAt)}</span>
                              {ticket.reviewerName && <span>by {ticket.reviewerName}</span>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {filteredTickets.length === 0 && filteredInvitations.length === 0 && (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">No notifications</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
