'use client';

import { useState, useEffect, useRef } from 'react';

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
    outputColumn: string;
    isGroup: boolean;
    groupName: string | null;
    isImported: boolean;
  } | null;
  strategy: {
    id: string;
    name: string;
    description: string;
    strategyType: string;
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

interface GroupChatModalProps {
  groupId: string;
  onClose: () => void;
}

export default function GroupChatModal({ groupId, onClose }: GroupChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Share resource modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'indicator' | 'strategy' | 'stockGroup' | 'viewSetting'>('indicator');
  const [availableResources, setAvailableResources] = useState<any[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [loadingResources, setLoadingResources] = useState(false);

  useEffect(() => {
    loadMessages();
  }, [groupId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/user-groups/${groupId}/messages`);
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load messages');
      } else {
        setMessages(data.messages || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const response = await fetch(`/api/user-groups/${groupId}/messages`, {
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
        case 'indicator':
          endpoint = '/api/indicators';
          break;
        case 'strategy':
          endpoint = '/api/strategies';
          break;
        case 'stockGroup':
          endpoint = '/api/groups';
          break;
        case 'viewSetting':
          endpoint = '/api/view-settings';
          break;
      }
      const response = await fetch(endpoint);
      const data = await response.json();
      // Filter to only owned resources
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
    if (!selectedResourceId) return;

    setSending(true);
    try {
      const body: any = { content: null };
      switch (shareType) {
        case 'indicator':
          body.indicatorId = selectedResourceId;
          break;
        case 'strategy':
          body.strategyId = selectedResourceId;
          break;
        case 'stockGroup':
          body.stockGroupId = selectedResourceId;
          break;
        case 'viewSetting':
          body.viewSettingId = selectedResourceId;
          break;
      }

      const response = await fetch(`/api/user-groups/${groupId}/messages`, {
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
    try {
      const response = await fetch(`/api/user-groups/${groupId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, resourceId }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to import resource');
      } else {
        alert(data.message);
        loadMessages(); // Refresh to update import status
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import resource');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
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
            {!message.indicator.isImported && (
              <button
                onClick={() => handleImportResource('indicator', message.indicator!.id)}
                className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
              >
                Import
              </button>
            )}
            {message.indicator.isImported && (
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
            {!message.strategy.isImported && (
              <button
                onClick={() => handleImportResource('strategy', message.strategy!.id)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Import
              </button>
            )}
            {message.strategy.isImported && (
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
              <p className="text-sm text-green-600 dark:text-green-400">
                {message.stockGroup.stockIds.length} stocks
              </p>
            </div>
            {!message.stockGroup.isImported && (
              <button
                onClick={() => handleImportResource('stockGroup', message.stockGroup!.id)}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Import
              </button>
            )}
            {message.stockGroup.isImported && (
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
            {!message.viewSetting.isImported && (
              <button
                onClick={() => handleImportResource('viewSetting', message.viewSetting!.id)}
                className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
              >
                Import
              </button>
            )}
            {message.viewSetting.isImported && (
              <span className="text-xs text-green-600 dark:text-green-400">Imported</span>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold dark:text-white">Group Chat</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-500">{error}</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex gap-3">
                <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                  {message.user.name?.[0] || '?'}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium dark:text-white">{message.user.name || 'Unknown'}</span>
                    <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
                  </div>
                  {message.content && (
                    <p className="text-gray-700 dark:text-gray-300 mt-1">{message.content}</p>
                  )}
                  {renderResource(message)}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t dark:border-gray-700">
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
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
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
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
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
                  {type === 'stockGroup' ? 'Stock Group' : type === 'viewSetting' ? 'View' : type.charAt(0).toUpperCase() + type.slice(1)}
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
