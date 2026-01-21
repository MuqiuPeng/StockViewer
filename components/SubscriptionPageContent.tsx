'use client';

import { useState, useEffect, useCallback } from 'react';
import CreatePostModal from './share/CreatePostModal';
import ImportWithRenameModal from './share/ImportWithRenameModal';

interface SubscriptionPost {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  isSubscribed: boolean;
  isOwner: boolean;
  subscriberCount: number;
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

export default function SubscriptionPageContent() {
  const [posts, setPosts] = useState<SubscriptionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subscribingPost, setSubscribingPost] = useState<SubscriptionPost | null>(null);

  // Search filters
  const [search, setSearch] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType !== 'all') {
        params.set('type', filterType);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (userEmail.trim()) {
        params.set('userEmail', userEmail.trim());
      }
      if (dateFrom) {
        params.set('dateFrom', dateFrom);
      }
      if (dateTo) {
        params.set('dateTo', dateTo);
      }
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/subscription/posts?${params}`);
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
  }, [filterType, page, search, userEmail, dateFrom, dateTo]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const clearFilters = () => {
    setSearch('');
    setUserEmail('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters = search || userEmail || dateFrom || dateTo;

  const handleSubscribeDataset = async (post: SubscriptionPost) => {
    if (!post.stock) return;

    try {
      const response = await fetch('/api/subscription/datasets/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: post.stock.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Subscribe failed');
      }

      alert('Dataset subscribed successfully!');
      fetchPosts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Subscribe failed');
    }
  };

  const handleSubscribeIndicator = async (displayName: string | null) => {
    if (!subscribingPost?.indicator) return;

    const response = await fetch('/api/subscription/indicators/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indicatorId: subscribingPost.indicator.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Subscribe failed');
    }

    fetchPosts();
  };

  const handleSubscribeStrategy = async (displayName: string | null) => {
    if (!subscribingPost?.strategy) return;

    const response = await fetch('/api/subscription/strategies/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId: subscribingPost.strategy.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Subscribe failed');
    }

    fetchPosts();
  };

  const getPostType = (post: SubscriptionPost): 'dataset' | 'indicator' | 'strategy' | 'deleted' => {
    if (post.stock) return 'dataset';
    if (post.indicator) return 'indicator';
    if (post.strategy) return 'strategy';
    return 'deleted';
  };

  const getTypeColor = (type: 'dataset' | 'indicator' | 'strategy' | 'deleted') => {
    switch (type) {
      case 'dataset':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'indicator':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'strategy':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'deleted':
        return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
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
              Subscription
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Share and subscribe to datasets, indicators, and strategies
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
        <div className="mb-4 flex gap-2 flex-wrap items-center">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`ml-auto px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
              showFilters || hasActiveFilters
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </button>
        </div>

        {/* Search & Filter Panel */}
        {showFilters && (
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search Title/Content
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search posts..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* User Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  User Email
                </label>
                <input
                  type="text"
                  value={userEmail}
                  onChange={(e) => {
                    setUserEmail(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Filter by email..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

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
                    <div className="flex items-center gap-2">
                      {/* Subscriber count badge for owners */}
                      {post.isOwner && post.subscriberCount > 0 && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                          </svg>
                          {post.subscriberCount}
                        </span>
                      )}
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(postType)}`}>
                        {postType}
                      </span>
                    </div>
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
                    {postType === 'deleted' && (
                      <div className="text-gray-400 dark:text-gray-500 italic">
                        This item has been deleted and is no longer available.
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="flex justify-end">
                    {postType === 'deleted' ? (
                      <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                        Unavailable
                      </span>
                    ) : post.isOwner ? (
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        Your post
                      </span>
                    ) : post.isSubscribed ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400 px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/30">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Subscribed
                      </span>
                    ) : postType === 'dataset' ? (
                      <button
                        onClick={() => handleSubscribeDataset(post)}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Subscribe Dataset
                      </button>
                    ) : (
                      <button
                        onClick={() => setSubscribingPost(post)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Subscribe {postType === 'indicator' ? 'Indicator' : 'Strategy'}
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

      {/* Subscribe Modal for Indicator/Strategy */}
      {subscribingPost && (subscribingPost.indicator || subscribingPost.strategy) && (
        <ImportWithRenameModal
          isOpen={true}
          onClose={() => setSubscribingPost(null)}
          itemType={subscribingPost.indicator ? 'indicator' : 'strategy'}
          item={
            subscribingPost.indicator
              ? {
                  id: subscribingPost.indicator.id,
                  name: subscribingPost.indicator.name,
                  description: subscribingPost.indicator.description,
                  creator: subscribingPost.user,
                }
              : {
                  id: subscribingPost.strategy!.id,
                  name: subscribingPost.strategy!.name,
                  description: subscribingPost.strategy!.description,
                  creator: subscribingPost.user,
                }
          }
          onImport={subscribingPost.indicator ? handleSubscribeIndicator : handleSubscribeStrategy}
        />
      )}
    </div>
  );
}
