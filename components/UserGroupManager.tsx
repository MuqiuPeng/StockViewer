'use client';

import { useState, useEffect } from 'react';
import GroupChatModal from './GroupChatModal';

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

interface UserGroupManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserGroupManager({ isOpen, onClose }: UserGroupManagerProps) {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
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
    if (isOpen) {
      loadGroups();
      loadInvitations();
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">User Groups</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700 mb-4">
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
            Invitations {invitations.length > 0 && `(${invitations.length})`}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        {activeTab === 'groups' && (
          <>
            <div className="mb-4 flex gap-2">
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Create New Group
                </button>
              ) : (
                <div className="flex-1 p-4 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700">
                  <input
                    type="text"
                    placeholder="Group name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full p-2 border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    className="w-full p-2 border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
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
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No groups yet. Create one to get started!
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="p-4 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold dark:text-white">{group.name}</h3>
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
                          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{group.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <span>Owner: {group.owner.name || 'Unknown'}</span>
                          <span>{group.memberCount} members</span>
                          <span>{group.messageCount} messages</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setChatGroupId(group.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Chat
                        </button>
                        {group.isOwner && (
                          <button
                            onClick={() => setInviteGroupId(group.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Invite
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          className={`px-3 py-1 text-white rounded text-sm ${
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
                      <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-600 rounded">
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="Enter email to invite"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="flex-1 p-2 border dark:border-gray-500 rounded dark:bg-gray-700 dark:text-white"
                          />
                          <button
                            onClick={handleInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {inviting ? 'Sending...' : 'Send'}
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
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No pending invitations
              </div>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-4 border dark:border-gray-600 rounded"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold dark:text-white">{invitation.group.name}</h3>
                        {invitation.group.description && (
                          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                            {invitation.group.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <span>From: {invitation.group.owner.name || 'Unknown'}</span>
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
