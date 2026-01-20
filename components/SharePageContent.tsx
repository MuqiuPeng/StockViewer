'use client';

import { useState, useEffect, useCallback } from 'react';
import CreatePostModal from './share/CreatePostModal';
import ImportWithRenameModal from './share/ImportWithRenameModal';

interface SharePost {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  isImported: boolean;
  isOwner: boolean;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  stock: {
    id: string;
    symbol: string;
    name: string;
    dataSource: string;
    rowCount: number;
    firstDate: string | null;
    lastDate: string | null;
  } | null;
  indicator: {
    id: string;
    name: string;
    description: string;
    category: string | null;
    tags: string[];
  } | null;
  strategy: {
    id: string;
    name: string;
    description: string;
    strategyType: string;
  } | null;
}

type FilterType = 'all' | 'dataset' | 'indicator' | 'strategy';

export default function SharePageContent() {
  const [posts, setPosts] = useState<SharePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [importingPost, setImportingPost] = useState<SharePost | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType !== 'all') {
        params.set('type', filterType);
      }
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/share/posts?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch posts');
      }

      setPosts(data.posts);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filterType, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleImportDataset = async (post: SharePost) => {
    if (!post.stock) return;

    try {
      const response = await fetch('/api/share/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: post.stock.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Import failed');
      }

      alert('Dataset imported successfully!');
      fetchPosts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleImportIndicator = async (displayName: string | null) => {
    if (!importingPost?.indicator) return;

    const response = await fetch('/api/share/indicators/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indicatorId: importingPost.indicator.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Import failed');
    }

    fetchPosts();
  };

  const handleImportStrategy = async (displayName: string | null) => {
    if (!importingPost?.strategy) return;

    const response = await fetch('/api/share/strategies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId: importingPost.strategy.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Import failed');
    }

    fetchPosts();
  };

  const getPostType = (post: SharePost): 'dataset' | 'indicator' | 'strategy' => {
    if (post.stock) return 'dataset';
    if (post.indicator) return 'indicator';
    return 'strategy';
  };

  const getTypeColor = (type: 'dataset' | 'indicator' | 'strategy') => {
    switch (type) {
      case 'dataset':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'indicator':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'strategy':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Share
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Share and discover datasets, indicators, and strategies
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + New Post
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2">
          {(['all', 'dataset', 'indicator', 'strategy'] as FilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setFilterType(type);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterType === type
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
        </div>

        {/* Posts Feed */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading posts...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 mb-4">
              No posts yet. Be the first to share something!
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Post
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const postType = getPostType(post);
              return (
                <div
                  key={post.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow p-5"
                >
                  {/* Post Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {post.user.image ? (
                        <img
                          src={post.user.image}
                          alt=""
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium">
                          {post.user.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {post.user.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(post.createdAt)}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(postType)}`}>
                      {postType}
                    </span>
                  </div>

                  {/* Post Title & Content */}
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {post.title}
                  </h3>
                  {post.content && (
                    <p className="text-gray-600 dark:text-gray-400 mb-4 whitespace-pre-wrap">
                      {post.content}
                    </p>
                  )}

                  {/* Shared Item Card */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                    {post.stock && (
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {post.stock.symbol} - {post.stock.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {post.stock.dataSource} | {post.stock.rowCount.toLocaleString()} rows
                          {post.stock.firstDate && post.stock.lastDate && (
                            <> | {new Date(post.stock.firstDate).toLocaleDateString()} - {new Date(post.stock.lastDate).toLocaleDateString()}</>
                          )}
                        </div>
                      </div>
                    )}
                    {post.indicator && (
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {post.indicator.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {post.indicator.description}
                        </div>
                        {post.indicator.category && (
                          <div className="mt-2">
                            <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                              {post.indicator.category}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {post.strategy && (
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {post.strategy.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {post.strategy.description}
                        </div>
                        <div className="mt-2">
                          <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                            {post.strategy.strategyType}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="flex justify-end">
                    {post.isOwner ? (
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        Your post
                      </span>
                    ) : post.isImported ? (
                      <span className="text-sm text-green-600 dark:text-green-400">
                        Imported
                      </span>
                    ) : postType === 'dataset' ? (
                      <button
                        onClick={() => handleImportDataset(post)}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Import Dataset
                      </button>
                    ) : (
                      <button
                        onClick={() => setImportingPost(post)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Import {postType === 'indicator' ? 'Indicator' : 'Strategy'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              Next
            </button>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            &larr; Back to Home
          </a>
        </div>
      </div>

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchPosts();
        }}
      />

      {/* Import Modal for Indicator/Strategy */}
      {importingPost && (importingPost.indicator || importingPost.strategy) && (
        <ImportWithRenameModal
          isOpen={true}
          onClose={() => setImportingPost(null)}
          itemType={importingPost.indicator ? 'indicator' : 'strategy'}
          item={
            importingPost.indicator
              ? {
                  id: importingPost.indicator.id,
                  name: importingPost.indicator.name,
                  description: importingPost.indicator.description,
                  creator: importingPost.user,
                }
              : {
                  id: importingPost.strategy!.id,
                  name: importingPost.strategy!.name,
                  description: importingPost.strategy!.description,
                  creator: importingPost.user,
                }
          }
          onImport={importingPost.indicator ? handleImportIndicator : handleImportStrategy}
        />
      )}
    </div>
  );
}
