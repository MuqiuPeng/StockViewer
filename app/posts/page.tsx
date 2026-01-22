'use client';

import { useState, useEffect } from 'react';

interface PostAttachment {
  id: string;
  type: string;
  originalId: string | null;
  originalName: string;
  snapshot: any;
  dependencies: any;
}

interface PostImage {
  id: string;
  url: string;
  caption: string | null;
  position: number;
}

interface Post {
  id: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  content: string | null;
  images: PostImage[];
  attachments: PostAttachment[];
  createdAt: string;
}

interface Resource {
  id: string;
  name: string;
  description?: string;
  type: 'indicator' | 'strategy' | 'stockGroup' | 'viewSetting' | 'backtestHistory';
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create post form
  const [newContent, setNewContent] = useState('');
  const [newImages, setNewImages] = useState<{ url: string; caption: string }[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<{ type: string; id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);

  // Resource selection
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [resourceType, setResourceType] = useState<string>('indicator');
  const [availableResources, setAvailableResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/posts');
      const data = await response.json();
      if (!data.error) {
        setPosts(data.posts || []);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
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
        case 'backtestHistory': endpoint = '/api/backtest-history?starred=true'; break;
      }
      const response = await fetch(endpoint);
      const data = await response.json();

      let resources: Resource[] = [];
      if (type === 'backtestHistory') {
        resources = (data.history || []).map((h: any) => ({
          id: h.id,
          name: `${h.strategyName} - ${new Date(h.createdAt).toLocaleDateString()}`,
          description: `Return: ${h.totalReturnPct.toFixed(2)}%`,
          type: 'backtestHistory',
        }));
      } else {
        const items = data.indicators || data.strategies || data.groups || data.settings || [];
        resources = items.filter((r: any) => r.isOwner).map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          type,
        }));
      }
      setAvailableResources(resources);
    } catch (err) {
      console.error('Failed to load resources:', err);
      setAvailableResources([]);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleAddAttachment = (resource: Resource) => {
    if (!selectedAttachments.find(a => a.id === resource.id && a.type === resource.type)) {
      setSelectedAttachments([...selectedAttachments, {
        type: resource.type,
        id: resource.id,
        name: resource.name,
      }]);
    }
    setShowResourcePicker(false);
  };

  const handleRemoveAttachment = (index: number) => {
    setSelectedAttachments(selectedAttachments.filter((_, i) => i !== index));
  };

  const handleCreatePost = async () => {
    if (!newContent.trim() && newImages.length === 0 && selectedAttachments.length === 0) {
      alert('Post must have content, images, or attachments');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          images: newImages.filter(img => img.url),
          attachments: selectedAttachments.map(a => ({ type: a.type, id: a.id })),
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to create post');
      } else {
        setPosts([data.post, ...posts]);
        setNewContent('');
        setNewImages([]);
        setSelectedAttachments([]);
        setShowCreateModal(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setCreating(false);
    }
  };

  const handleUseTemplate = async (postId: string, attachment: PostAttachment) => {
    const newName = prompt(`Enter name for the new ${attachment.type}:`, attachment.originalName);
    if (!newName) return;

    try {
      const response = await fetch(`/api/posts/${postId}/use-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: attachment.id, newName }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to use template');
      } else {
        alert(`Created ${data.resource.type}: ${data.resource.name}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to use template');
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const response = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        alert(data.message || 'Failed to delete post');
      } else {
        setPosts(posts.filter(p => p.id !== postId));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete post');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getAttachmentColor = (type: string) => {
    switch (type) {
      case 'indicator': return 'purple';
      case 'strategy': return 'blue';
      case 'stockGroup': return 'green';
      case 'viewSetting': return 'orange';
      case 'backtestHistory': return 'pink';
      default: return 'gray';
    }
  };

  const getAttachmentLabel = (type: string) => {
    switch (type) {
      case 'indicator': return 'INDICATOR';
      case 'strategy': return 'STRATEGY';
      case 'stockGroup': return 'STOCK GROUP';
      case 'viewSetting': return 'VIEW SETTING';
      case 'backtestHistory': return 'BACKTEST';
      default: return type.toUpperCase();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-14">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold dark:text-white">Posts</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            New Post
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">No posts yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-blue-600 hover:underline"
            >
              Create your first post
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                {/* Post Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm font-medium">
                      {post.user.name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="font-medium dark:text-white">{post.user.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{formatTime(post.createdAt)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="text-gray-400 hover:text-red-600"
                    title="Delete post"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Post Content */}
                {post.content && (
                  <p className="text-gray-800 dark:text-gray-200 mb-4 whitespace-pre-wrap">{post.content}</p>
                )}

                {/* Post Images */}
                {post.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {post.images.map((img) => (
                      <div key={img.id} className="relative">
                        <img src={img.url} alt={img.caption || ''} className="w-full rounded-lg" />
                        {img.caption && (
                          <p className="text-xs text-gray-500 mt-1">{img.caption}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Post Attachments */}
                {post.attachments.length > 0 && (
                  <div className="space-y-2">
                    {post.attachments.map((att) => {
                      const color = getAttachmentColor(att.type);
                      return (
                        <div
                          key={att.id}
                          className={`bg-${color}-50 dark:bg-${color}-900/30 border border-${color}-200 dark:border-${color}-700 rounded p-3`}
                          style={{
                            backgroundColor: `var(--${color}-50, #f3e8ff)`,
                            borderColor: `var(--${color}-200, #e9d5ff)`,
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-xs text-${color}-600 dark:text-${color}-400 font-medium`}>
                                {getAttachmentLabel(att.type)}
                              </span>
                              <h4 className={`font-semibold text-${color}-800 dark:text-${color}-200`}>
                                {att.originalName}
                              </h4>
                              {att.dependencies && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {att.dependencies.strategyName && (
                                    <span>Strategy: {att.dependencies.strategyName}</span>
                                  )}
                                  {att.dependencies.stockGroupName && (
                                    <span className="ml-2">Group: {att.dependencies.stockGroupName}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleUseTemplate(post.id, att)}
                              className={`px-3 py-1 bg-${color}-600 text-white rounded text-sm hover:bg-${color}-700`}
                              style={{ backgroundColor: '#7c3aed' }}
                            >
                              Use as Template
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold dark:text-white mb-4">Create Post</h3>

            {/* Content */}
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write something..."
              className="w-full p-3 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white resize-none"
              rows={4}
            />

            {/* Image URL input */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Image URL (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://..."
                  className="flex-1 p-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      if (input.value) {
                        setNewImages([...newImages, { url: input.value, caption: '' }]);
                        input.value = '';
                      }
                    }
                  }}
                />
              </div>
              {newImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {newImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.url} alt="" className="h-16 w-16 object-cover rounded" />
                      <button
                        onClick={() => setNewImages(newImages.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Attachments (Templates)
                </label>
                <button
                  onClick={() => {
                    setShowResourcePicker(true);
                    loadResources(resourceType);
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  + Add Resource
                </button>
              </div>
              {selectedAttachments.length > 0 && (
                <div className="space-y-2">
                  {selectedAttachments.map((att, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded"
                    >
                      <div>
                        <span className="text-xs text-gray-500 uppercase">{att.type}</span>
                        <span className="ml-2 dark:text-white">{att.name}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAttachment(i)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource Picker Modal */}
      {showResourcePicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowResourcePicker(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h4 className="text-lg font-bold dark:text-white mb-4">Select Resource</h4>

            {/* Resource Type Tabs */}
            <div className="flex flex-wrap gap-1 mb-4">
              {['indicator', 'strategy', 'stockGroup', 'viewSetting', 'backtestHistory'].map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setResourceType(type);
                    loadResources(type);
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    resourceType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {type === 'backtestHistory' ? 'Backtest' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* Resource List */}
            <div className="max-h-64 overflow-y-auto">
              {loadingResources ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : availableResources.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  {resourceType === 'backtestHistory' ? 'No starred backtest history' : 'No resources found'}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableResources.map((resource) => (
                    <button
                      key={resource.id}
                      onClick={() => handleAddAttachment(resource)}
                      className="w-full text-left p-3 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <div className="font-medium dark:text-white">{resource.name}</div>
                      {resource.description && (
                        <div className="text-sm text-gray-500 truncate">{resource.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowResourcePicker(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
