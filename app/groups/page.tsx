'use client';

import { useState, useEffect, useRef } from 'react';

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

interface Message {
  id: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  content: string | null;
  indicator: {
    id: string;
    name: string;
    description: string;
    isImported: boolean;
  } | null;
  strategy: {
    id: string;
    name: string;
    description: string;
    isImported: boolean;
  } | null;
  stockGroup: {
    id: string;
    name: string;
    description: string | null;
    stockIds: string[];
    isImported: boolean;
  } | null;
  viewSetting: {
    id: string;
    name: string;
    isImported: boolean;
  } | null;
  createdAt: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected group and chat
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create group form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Share resource modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'indicator' | 'strategy' | 'stockGroup' | 'viewSetting'>('indicator');
  const [availableResources, setAvailableResources] = useState<any[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [loadingResources, setLoadingResources] = useState(false);

  // Left panel tab
  const [leftTab, setLeftTab] = useState<'groups' | 'invitations'>('groups');

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  useEffect(() => {
    loadGroups();
    loadInvitations();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadMessages();
    }
  }, [selectedGroupId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
        // Auto-select first group if none selected
        if (!selectedGroupId && data.groups?.length > 0) {
          setSelectedGroupId(data.groups[0].id);
        }
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

  const loadMessages = async () => {
    if (!selectedGroupId) return;
    setMessagesLoading(true);
    try {
      const response = await fetch(`/api/user-groups/${selectedGroupId}/messages`);
      const data = await response.json();
      if (!data.error) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
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
        setSelectedGroupId(data.group.id);
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
        if (selectedGroupId === group.id) {
          setSelectedGroupId(null);
          setMessages([]);
        }
        loadGroups();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleInvite = async () => {
    if (!selectedGroupId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const response = await fetch(`/api/user-groups/${selectedGroupId}/invite`, {
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
        setShowInviteForm(false);
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGroupId) return;
    setSending(true);
    try {
      const response = await fetch(`/api/user-groups/${selectedGroupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to send message');
      } else {
        setMessages([...messages, data.message]);
        setNewMessage('');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const loadResources = async (type: string) => {
    setLoadingResources(true);
    try {
      let endpoint = '';
      switch (type) {
        case 'indicator': endpoint = '/api/indicators'; break;
        case 'strategy': endpoint = '/api/strategies'; break;
        case 'stockGroup': endpoint = '/api/groups'; break;
        case 'viewSetting': endpoint = '/api/view-settings'; break;
      }
      const response = await fetch(endpoint);
      const data = await response.json();
      const owned = (data.indicators || data.strategies || data.groups || data.settings || [])
        .filter((r: any) => r.isOwner);
      setAvailableResources(owned);
    } catch (err) {
      console.error('Failed to load resources:', err);
      setAvailableResources([]);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleShareResource = async () => {
    if (!selectedResourceId || !selectedGroupId) return;
    setSending(true);
    try {
      const body: any = { content: null };
      switch (shareType) {
        case 'indicator': body.indicatorId = selectedResourceId; break;
        case 'strategy': body.strategyId = selectedResourceId; break;
        case 'stockGroup': body.stockGroupId = selectedResourceId; break;
        case 'viewSetting': body.viewSettingId = selectedResourceId; break;
      }
      const response = await fetch(`/api/user-groups/${selectedGroupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to share resource');
      } else {
        setMessages([...messages, data.message]);
        setShowShareModal(false);
        setSelectedResourceId('');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to share resource');
    } finally {
      setSending(false);
    }
  };

  const handleImportResource = async (type: string, resourceId: string) => {
    if (!selectedGroupId) return;
    try {
      const response = await fetch(`/api/user-groups/${selectedGroupId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, resourceId }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to import resource');
      } else {
        alert(data.message);
        loadMessages();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import resource');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderResource = (message: Message) => {
    if (message.indicator) {
      return (
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">INDICATOR</span>
              <h4 className="font-semibold text-purple-800 dark:text-purple-200">{message.indicator.name}</h4>
              <p className="text-sm text-purple-600 dark:text-purple-400">{message.indicator.description}</p>
            </div>
            {!message.indicator.isImported ? (
              <button
                onClick={() => handleImportResource('indicator', message.indicator!.id)}
                className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
              >
                Import
              </button>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
            )}
          </div>
        </div>
      );
    }

    if (message.strategy) {
      return (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">STRATEGY</span>
              <h4 className="font-semibold text-blue-800 dark:text-blue-200">{message.strategy.name}</h4>
              <p className="text-sm text-blue-600 dark:text-blue-400">{message.strategy.description}</p>
            </div>
            {!message.strategy.isImported ? (
              <button
                onClick={() => handleImportResource('strategy', message.strategy!.id)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Import
              </button>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
            )}
          </div>
        </div>
      );
    }

    if (message.stockGroup) {
      return (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">STOCK GROUP</span>
              <h4 className="font-semibold text-green-800 dark:text-green-200">{message.stockGroup.name}</h4>
              <p className="text-sm text-green-600 dark:text-green-400">{message.stockGroup.stockIds.length} stocks</p>
            </div>
            {!message.stockGroup.isImported ? (
              <button
                onClick={() => handleImportResource('stockGroup', message.stockGroup!.id)}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Import
              </button>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
            )}
          </div>
        </div>
      );
    }

    if (message.viewSetting) {
      return (
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">VIEW SETTING</span>
              <h4 className="font-semibold text-orange-800 dark:text-orange-200">{message.viewSetting.name}</h4>
            </div>
            {!message.viewSetting.isImported ? (
              <button
                onClick={() => handleImportResource('viewSetting', message.viewSetting!.id)}
                className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
              >
                Import
              </button>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 pt-14 flex">
      {/* Left Panel - Group List */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        {/* Left Panel Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold dark:text-white">Groups</h2>
            <button
              onClick={() => setShowCreateForm(true)}
              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
              title="Create new group"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setLeftTab('groups')}
              className={`flex-1 py-1.5 text-sm rounded ${
                leftTab === 'groups'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              My Groups ({groups.length})
            </button>
            <button
              onClick={() => setLeftTab('invitations')}
              className={`flex-1 py-1.5 text-sm rounded relative ${
                leftTab === 'invitations'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Invitations
              {invitations.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {invitations.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Create Group Form */}
        {showCreateForm && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <input
              type="text"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full p-2 text-sm border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              className="w-full p-2 text-sm border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateGroup}
                disabled={creating || !newGroupName.trim()}
                className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewGroupName('');
                  setNewGroupDescription('');
                }}
                className="flex-1 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Group List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : leftTab === 'groups' ? (
            groups.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                <p>No groups yet</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  Create your first group
                </button>
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    selectedGroupId === group.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium dark:text-white truncate">{group.name}</h3>
                    {group.isOwner && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs rounded">
                        Owner
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{group.memberCount} members</span>
                    <span>{group.messageCount} messages</span>
                  </div>
                </div>
              ))
            )
          ) : (
            invitations.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                No pending invitations
              </div>
            ) : (
              invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="p-3 border-b border-gray-100 dark:border-gray-700"
                >
                  <h3 className="font-medium dark:text-white">{invitation.group.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    From: {invitation.group.owner.name || 'Unknown'}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleInvitationAction(invitation.id, 'accept')}
                      className="flex-1 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInvitationAction(invitation.id, 'reject')}
                      className="flex-1 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
        {selectedGroup ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold dark:text-white">{selectedGroup.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedGroup.memberCount} members
                  {selectedGroup.description && ` · ${selectedGroup.description}`}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedGroup.isOwner && (
                  <button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Invite
                  </button>
                )}
                <button
                  onClick={() => handleDeleteGroup(selectedGroup)}
                  className={`px-3 py-1.5 text-sm text-white rounded ${
                    selectedGroup.isOwner ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {selectedGroup.isOwner ? 'Dissolve' : 'Leave'}
                </button>
              </div>
            </div>

            {/* Invite Form */}
            {showInviteForm && (
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex gap-2">
                <input
                  type="email"
                  placeholder="Enter email to invite"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 p-2 text-sm border dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white"
                />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {inviting ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmail('');
                  }}
                  className="px-4 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messagesLoading ? (
                <div className="text-center text-gray-500">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="flex gap-3">
                    <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                      {message.user.name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium dark:text-white">{message.user.name || 'Unknown'}</span>
                        <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
                      </div>
                      {message.content && (
                        <p className="text-gray-700 dark:text-gray-300 mt-1 break-words">{message.content}</p>
                      )}
                      {renderResource(message)}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowShareModal(true);
                    setShareType('indicator');
                    loadResources('indicator');
                  }}
                  className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                >
                  Share
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-lg">Select a group to start chatting</p>
              <p className="text-sm mt-2">or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Share Resource Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h4 className="text-lg font-semibold dark:text-white mb-4">Share Resource</h4>

            <div className="flex gap-2 mb-4">
              {(['indicator', 'strategy', 'stockGroup', 'viewSetting'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setShareType(type);
                    setSelectedResourceId('');
                    loadResources(type);
                  }}
                  className={`px-3 py-1 rounded text-sm ${
                    shareType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {type === 'stockGroup' ? 'Group' : type === 'viewSetting' ? 'View' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            <select
              value={selectedResourceId}
              onChange={(e) => setSelectedResourceId(e.target.value)}
              className="w-full p-2 border dark:border-gray-600 rounded mb-4 dark:bg-gray-700 dark:text-white"
              disabled={loadingResources}
            >
              <option value="">
                {loadingResources ? 'Loading...' : `Select ${shareType}...`}
              </option>
              {availableResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleShareResource}
                disabled={!selectedResourceId || sending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
