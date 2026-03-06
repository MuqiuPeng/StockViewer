'use client';

import { useState, useEffect, useRef } from 'react';

interface Team {
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
  team: {
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

interface Dependency {
  name: string;
  creatorName: string;
}

interface Message {
  id: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  content: string | null;
  isOwn: boolean;
  indicator: {
    id: string;
    name: string;
    description: string;
    dependencies: Dependency[];
    isImported: boolean;
  } | null;
  strategy: {
    id: string;
    name: string;
    description: string;
    dependencies: Dependency[];
    isImported: boolean;
  } | null;
  stockTeam: {
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

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected team and chat
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create team form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Share resource modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'indicator' | 'strategy' | 'stockTeam' | 'viewSetting'>('indicator');
  const [availableResources, setAvailableResources] = useState<any[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [loadingResources, setLoadingResources] = useState(false);

  // Left panel tab
  const [leftTab, setLeftTab] = useState<'teams' | 'invitations'>('teams');

  // Expanded dependencies tracking
  const [expandedDeps, setExpandedDeps] = useState<Set<string>>(new Set());

  const toggleDepsExpanded = (messageId: string) => {
    setExpandedDeps(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const selectedTeam = teams.find(g => g.id === selectedTeamId);

  useEffect(() => {
    loadTeams();
    loadInvitations();
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      loadMessages();
    }
  }, [selectedTeamId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadTeams = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/teams');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load teams');
      } else {
        setTeams(data.teams || []);
        // Auto-select first team if none selected
        if (!selectedTeamId && data.teams?.length > 0) {
          setSelectedTeamId(data.teams[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
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
    if (!selectedTeamId) return;
    setMessagesLoading(true);
    try {
      const response = await fetch(`/api/teams/${selectedTeamId}/messages`);
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

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTeamName,
          description: newTeamDescription || null,
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to create team');
      } else {
        setNewTeamName('');
        setNewTeamDescription('');
        setShowCreateForm(false);
        loadTeams();
        setSelectedTeamId(data.team.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    const message = team.isOwner
      ? `Are you sure you want to dissolve "${team.name}"? This will remove all members.`
      : `Are you sure you want to leave "${team.name}"?`;
    if (!confirm(message)) return;

    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Operation failed');
      } else {
        if (selectedTeamId === team.id) {
          setSelectedTeamId(null);
          setMessages([]);
        }
        loadTeams();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleInvite = async () => {
    if (!selectedTeamId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const response = await fetch(`/api/teams/${selectedTeamId}/invite`, {
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
          loadTeams();
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTeamId) return;
    setSending(true);
    try {
      const response = await fetch(`/api/teams/${selectedTeamId}/messages`, {
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
        case 'stockTeam': endpoint = '/api/teams'; break;
        case 'viewSetting': endpoint = '/api/view-settings'; break;
      }
      const response = await fetch(endpoint);
      const data = await response.json();
      const owned = (data.indicators || data.strategies || data.teams || data.settings || [])
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
    if (!selectedResourceId || !selectedTeamId) return;
    setSending(true);
    try {
      const body: any = { content: null };
      switch (shareType) {
        case 'indicator': body.indicatorId = selectedResourceId; break;
        case 'strategy': body.strategyId = selectedResourceId; break;
        case 'stockTeam': body.stockTeamId = selectedResourceId; break;
        case 'viewSetting': body.viewSettingId = selectedResourceId; break;
      }
      const response = await fetch(`/api/teams/${selectedTeamId}/messages`, {
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
    if (!selectedTeamId) return;
    try {
      const response = await fetch(`/api/teams/${selectedTeamId}/import`, {
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

  const handleRetractMessage = async (messageId: string) => {
    if (!selectedTeamId) return;
    if (!confirm('Are you sure you want to retract this share?')) return;
    try {
      const response = await fetch(
        `/api/teams/${selectedTeamId}/messages?messageId=${messageId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to retract');
      } else {
        setMessages(messages.filter(m => m.id !== messageId));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retract');
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
      const deps = message.indicator.dependencies || [];
      const isExpanded = expandedDeps.has(message.id);
      return (
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">INDICATOR</span>
              <h4 className="font-semibold text-purple-800 dark:text-purple-200">{message.indicator.name}</h4>
              <p className="text-sm text-purple-600 dark:text-purple-400">{message.indicator.description}</p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {message.isOwn && (
                <button
                  onClick={() => handleRetractMessage(message.id)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Retract this share"
                >
                  Retract
                </button>
              )}
              {!message.indicator.isImported && !message.isOwn ? (
                <button
                  onClick={() => handleImportResource('indicator', message.indicator!.id)}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 whitespace-nowrap"
                >
                  Import{deps.length > 0 ? ` (+${deps.length})` : ''}
                </button>
              ) : !message.isOwn ? (
                <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
              ) : null}
            </div>
          </div>
          {deps.length > 0 && (
            <div className="mt-2 border-t border-purple-200 dark:border-purple-700 pt-2">
              <button
                onClick={() => toggleDepsExpanded(message.id)}
                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Dependencies ({deps.length})
              </button>
              {isExpanded && (
                <div className="mt-2 pl-5 space-y-1">
                  {deps.map((dep, i) => (
                    <div key={i} className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                      <span className="text-purple-500 dark:text-purple-300">{dep.creatorName}</span>
                      <span>/</span>
                      <span className="font-medium">{dep.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (message.strategy) {
      const deps = message.strategy.dependencies || [];
      const isExpanded = expandedDeps.has(message.id);
      return (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">STRATEGY</span>
              <h4 className="font-semibold text-blue-800 dark:text-blue-200">{message.strategy.name}</h4>
              <p className="text-sm text-blue-600 dark:text-blue-400">{message.strategy.description}</p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {message.isOwn && (
                <button
                  onClick={() => handleRetractMessage(message.id)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Retract this share"
                >
                  Retract
                </button>
              )}
              {!message.strategy.isImported && !message.isOwn ? (
                <button
                  onClick={() => handleImportResource('strategy', message.strategy!.id)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 whitespace-nowrap"
                >
                  Import{deps.length > 0 ? ` (+${deps.length})` : ''}
                </button>
              ) : !message.isOwn ? (
                <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
              ) : null}
            </div>
          </div>
          {deps.length > 0 && (
            <div className="mt-2 border-t border-blue-200 dark:border-blue-700 pt-2">
              <button
                onClick={() => toggleDepsExpanded(message.id)}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Dependencies ({deps.length})
              </button>
              {isExpanded && (
                <div className="mt-2 pl-5 space-y-1">
                  {deps.map((dep, i) => (
                    <div key={i} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                      <span className="text-blue-500 dark:text-blue-300">{dep.creatorName}</span>
                      <span>/</span>
                      <span className="font-medium">{dep.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (message.stockTeam) {
      return (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">STOCK GROUP</span>
              <h4 className="font-semibold text-green-800 dark:text-green-200">{message.stockTeam.name}</h4>
              <p className="text-sm text-green-600 dark:text-green-400">{message.stockTeam.stockIds.length} stocks</p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {message.isOwn && (
                <button
                  onClick={() => handleRetractMessage(message.id)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Retract this share"
                >
                  Retract
                </button>
              )}
              {!message.stockTeam.isImported && !message.isOwn ? (
                <button
                  onClick={() => handleImportResource('stockTeam', message.stockTeam!.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Import
                </button>
              ) : !message.isOwn ? (
                <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    if (message.viewSetting) {
      return (
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded p-3 mt-2">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">VIEW SETTING</span>
              <h4 className="font-semibold text-orange-800 dark:text-orange-200">{message.viewSetting.name}</h4>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {message.isOwn && (
                <button
                  onClick={() => handleRetractMessage(message.id)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Retract this share"
                >
                  Retract
                </button>
              )}
              {!message.viewSetting.isImported && !message.isOwn ? (
                <button
                  onClick={() => handleImportResource('viewSetting', message.viewSetting!.id)}
                  className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
                >
                  Import
                </button>
              ) : !message.isOwn ? (
                <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 pt-14 flex">
      {/* Left Panel - Team List */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        {/* Left Panel Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold dark:text-white">Teams</h2>
            <button
              onClick={() => setShowCreateForm(true)}
              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
              title="Create new team"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setLeftTab('teams')}
              className={`flex-1 py-1.5 text-sm rounded ${
                leftTab === 'teams'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              My Teams ({teams.length})
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

        {/* Create Team Form */}
        {showCreateForm && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <input
              type="text"
              placeholder="Team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="w-full p-2 text-sm border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newTeamDescription}
              onChange={(e) => setNewTeamDescription(e.target.value)}
              className="w-full p-2 text-sm border dark:border-gray-600 rounded mb-2 dark:bg-gray-800 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateTeam}
                disabled={creating || !newTeamName.trim()}
                className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewTeamName('');
                  setNewTeamDescription('');
                }}
                className="flex-1 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Team List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : leftTab === 'teams' ? (
            teams.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                <p>No teams yet</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  Create your first team
                </button>
              </div>
            ) : (
              teams.map((team) => (
                <div
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    selectedTeamId === team.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium dark:text-white truncate">{team.name}</h3>
                    {team.isOwner && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs rounded">
                        Owner
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{team.memberCount} members</span>
                    <span>{team.messageCount} messages</span>
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
                  <h3 className="font-medium dark:text-white">{invitation.team.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    From: {invitation.team.owner.name || 'Unknown'}
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
        {selectedTeam ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold dark:text-white">{selectedTeam.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedTeam.memberCount} members
                  {selectedTeam.description && ` · ${selectedTeam.description}`}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedTeam.isOwner && (
                  <button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Invite
                  </button>
                )}
                <button
                  onClick={() => handleDeleteTeam(selectedTeam)}
                  className={`px-3 py-1.5 text-sm text-white rounded ${
                    selectedTeam.isOwner ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {selectedTeam.isOwner ? 'Dissolve' : 'Leave'}
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
              <p className="text-lg">Select a team to start chatting</p>
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
              {(['indicator', 'strategy', 'stockTeam', 'viewSetting'] as const).map((type) => (
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
                  {type === 'stockTeam' ? 'Team' : type === 'viewSetting' ? 'View' : type.charAt(0).toUpperCase() + type.slice(1)}
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
