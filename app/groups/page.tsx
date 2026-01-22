'use client';

import { useState, useEffect } from 'react';
import GroupChatModal from '@/components/GroupChatModal';

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  owner: {
    id: string;
    name: string | null;
    image: string | null;
  };
  memberCount: number;
  messageCount: number;
  members: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
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
  status: string;
  createdAt: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'groups' | 'invitations'>('groups');

  // Create group form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Chat modal
  const [chatGroupId, setChatGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
    loadInvitations();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/user-groups');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load groups');
      } else {
        setGroups(data.groups || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadInvitations = async () => {
    try {
      const response = await fetch('/api/invitations');
      const data = await response.json();
      if (!data.error) {
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/user-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDescription || null,
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to create group');
      } else {
        setNewGroupName('');
        setNewGroupDescription('');
        setShowCreateForm(false);
        loadGroups();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = async (group: UserGroup) => {
    const message = group.isOwner
      ? `Are you sure you want to dissolve "${group.name}"? This will remove all members.`
      : `Are you sure you want to leave "${group.name}"?`;

    if (!confirm(message)) return;

    try {
      const response = await fetch(`/api/user-groups/${group.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Operation failed');
      } else {
        loadGroups();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleInvite = async () => {
    if (!inviteGroupId || !inviteEmail.trim()) return;

    setInviting(true);
    try {
      const response = await fetch(`/api/user-groups/${inviteGroupId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to send invitation');
      } else {
        alert('Invitation sent!');
        setInviteEmail('');
        setInviteGroupId(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
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
        loadInvitations();
        if (action === 'accept') {
          loadGroups();
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold dark:text-white mb-6">User Groups</h1>

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'groups'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            My Groups ({groups.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'invitations'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Invitations {invitations.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {invitations.length}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        {activeTab === 'groups' && (
          <>
            <div className="mb-6">
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Create New Group
                </button>
              ) : (
                <div className="p-4 border dark:border-gray-600 rounded bg-white dark:bg-gray-800">
                  <input
                    type="text"
                    placeholder="Group name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full p-2 border dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    className="w-full p-2 border dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateGroup}
                      disabled={creating || !newGroupName.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewGroupName('');
                        setNewGroupDescription('');
                      }}
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading groups...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400 mb-4">No groups yet. Create one to get started!</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create Your First Group
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="p-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-semibold dark:text-white">{group.name}</h3>
                          {group.isOwner ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs rounded">
                              Owner
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs rounded">
                              Member
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-gray-600 dark:text-gray-400 mb-3">{group.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Owner: {group.owner.name || 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {group.memberCount} members
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {group.messageCount} messages
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setChatGroupId(group.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Open Chat
                        </button>
                        {group.isOwner && (
                          <button
                            onClick={() => setInviteGroupId(inviteGroupId === group.id ? null : group.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Invite
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          className={`px-4 py-2 text-white rounded ${
                            group.isOwner
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-orange-600 hover:bg-orange-700'
                          }`}
                        >
                          {group.isOwner ? 'Dissolve' : 'Leave'}
                        </button>
                      </div>
                    </div>

                    {/* Invite form for this group */}
                    {inviteGroupId === group.id && (
                      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded">
                        <h4 className="font-medium dark:text-white mb-2">Invite a member</h4>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="Enter email address"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="flex-1 p-2 border dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white"
                          />
                          <button
                            onClick={handleInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {inviting ? 'Sending...' : 'Send Invitation'}
                          </button>
                          <button
                            onClick={() => {
                              setInviteGroupId(null);
                              setInviteEmail('');
                            }}
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'invitations' && (
          <>
            {invitations.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No pending invitations</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold dark:text-white mb-2">{invitation.group.name}</h3>
                        {invitation.group.description && (
                          <p className="text-gray-600 dark:text-gray-400 mb-3">
                            {invitation.group.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span>Invited by: {invitation.group.owner.name || 'Unknown'}</span>
                          <span>{invitation.group.memberCount} members</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'accept')}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'reject')}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat Modal */}
      {chatGroupId && (
        <GroupChatModal
          groupId={chatGroupId}
          onClose={() => setChatGroupId(null)}
        />
      )}
    </div>
  );
}
