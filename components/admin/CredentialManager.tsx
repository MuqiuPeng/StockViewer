'use client';

/**
 * Provider credential management.
 *
 * Secrets are write-only here as they are in the API: a stored key is never
 * fetched or displayed. The table shows what a credential is, whether the
 * server can read it, and when it lapses; changing a key means typing a new
 * one, not editing the old.
 */
import { useCallback, useEffect, useState } from 'react';

interface Budget {
  kind: string;
  limit: number;
  window: string;
}

interface Credential {
  id: string;
  provider: string;
  label: string;
  enabled: boolean;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
  expiresInDays: number | null;
  budgets: Budget[];
  notes: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
  readable: boolean | null;
}

const BUDGET_KINDS = ['requests', 'credits', 'bytes', 'symbols'];
const BUDGET_WINDOWS = ['minute', 'hour', 'day', 'month', 'lifetime'];

const EMPTY_FORM = {
  provider: '',
  label: '',
  secret: '',
  priority: 0,
  validUntil: '',
  notes: '',
};

export default function CredentialManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [cryptoConfigured, setCryptoConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotateSecret, setRotateSecret] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/credentials');
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'Failed to load credentials');
        return;
      }
      const data = await res.json();
      setCredentials(data.credentials || []);
      setCryptoConfigured(data.cryptoConfigured !== false);
      setError(null);
    } catch {
      setError('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/admin/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, budgets }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || 'Failed to store credential');
      return;
    }
    setNotice(body.message);
    setForm({ ...EMPTY_FORM });
    setBudgets([]);
    setShowForm(false);
    load();
  }

  async function rotate(id: string) {
    if (!rotateSecret) return;
    const res = await fetch(`/api/admin/credentials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: rotateSecret }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || 'Rotation failed');
      return;
    }
    setNotice(body.message);
    setRotatingId(null);
    setRotateSecret('');
    load();
  }

  async function toggle(cred: Credential) {
    await fetch(`/api/admin/credentials/${cred.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !cred.enabled }),
    });
    load();
  }

  async function remove(cred: Credential) {
    if (!confirm(`Delete ${cred.provider}/${cred.label}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/credentials/${cred.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || 'Delete failed');
      return;
    }
    setNotice(body.message);
    load();
  }

  function statusOf(c: Credential): { text: string; className: string } {
    if (!c.enabled) return { text: 'disabled', className: 'text-gray-500' };
    if (c.readable === false) return { text: 'unreadable', className: 'text-red-600 dark:text-red-400' };
    if (c.expiresInDays !== null && c.expiresInDays < 0)
      return { text: 'expired', className: 'text-red-600 dark:text-red-400' };
    if (c.expiresInDays !== null && c.expiresInDays <= 30)
      return { text: `${c.expiresInDays}d left`, className: 'text-amber-600 dark:text-amber-400' };
    return { text: 'active', className: 'text-green-600 dark:text-green-400' };
  }

  return (
    <div className="space-y-4">
      {!cryptoConfigured && (
        <div className="p-3 rounded border border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
          <strong>CREDENTIAL_ENCRYPTION_KEY is not set.</strong> Credentials cannot be
          stored or read until it is. Generate one with{' '}
          <code className="px-1 bg-black/10 dark:bg-white/10 rounded">
            python scripts/credentials.py genkey
          </code>{' '}
          in <code>data-service</code>, then add it to <code>.env</code>. Keep it — losing
          it makes every stored credential unreadable.
        </div>
      )}

      {error && (
        <div className="p-3 rounded border border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded border border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Keys are stored encrypted and never sent back to the browser. Rotating means
          entering a new value.
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add credential'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="p-4 rounded border border-gray-300 dark:border-gray-600 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block mb-1 dark:text-gray-300">Provider</span>
              <input
                required
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="tiingo"
                className="w-full px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 dark:text-gray-300">Label</span>
              <input
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="primary"
                className="w-full px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </label>
          </div>

          <label className="text-sm block">
            <span className="block mb-1 dark:text-gray-300">Secret</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              className="w-full px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block mb-1 dark:text-gray-300">Priority (lower wins)</span>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 dark:text-gray-300">Expires (optional)</span>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full px-2 py-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm dark:text-gray-300">Budgets</span>
              <button
                type="button"
                onClick={() =>
                  setBudgets([...budgets, { kind: 'requests', limit: 0, window: 'day' }])
                }
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                + add
              </button>
            </div>
            {budgets.map((b, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={b.kind}
                  onChange={(e) => {
                    const next = [...budgets];
                    next[i] = { ...b, kind: e.target.value };
                    setBudgets(next);
                  }}
                  className="px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {BUDGET_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={b.limit}
                  onChange={(e) => {
                    const next = [...budgets];
                    next[i] = { ...b, limit: Number(e.target.value) };
                    setBudgets(next);
                  }}
                  className="w-32 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <span className="text-sm text-gray-500">per</span>
                <select
                  value={b.window}
                  onChange={(e) => {
                    const next = [...budgets];
                    next[i] = { ...b, window: e.target.value };
                    setBudgets(next);
                  }}
                  className="px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {BUDGET_WINDOWS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setBudgets(budgets.filter((_, j) => j !== i))}
                  className="text-xs text-red-600 hover:underline"
                >
                  remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Store credential
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-gray-500">
          No stored credentials. Providers are using their .env values.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-600 dark:text-gray-300">
                <th className="py-2 pr-3">Credential</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Budgets</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => {
                const status = statusOf(c);
                return (
                  <tr key={c.id} className="border-b dark:border-gray-700 dark:text-gray-200">
                    <td className="py-2 pr-3 font-mono">{c.provider}/{c.label}</td>
                    <td className={`py-2 pr-3 ${status.className}`}>{status.text}</td>
                    <td className="py-2 pr-3">{c.priority}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-400">
                      {(c.budgets || []).length === 0
                        ? '—'
                        : c.budgets.map((b) => `${b.limit} ${b.kind}/${b.window}`).join(', ')}
                    </td>
                    <td className="py-2 pr-3 space-x-2 whitespace-nowrap">
                      {rotatingId === c.id ? (
                        <span className="inline-flex gap-1 items-center">
                          <input
                            type="password"
                            autoComplete="off"
                            placeholder="new secret"
                            value={rotateSecret}
                            onChange={(e) => setRotateSecret(e.target.value)}
                            className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                          <button
                            onClick={() => rotate(c.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            save
                          </button>
                          <button
                            onClick={() => { setRotatingId(null); setRotateSecret(''); }}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => setRotatingId(c.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            rotate
                          </button>
                          <button
                            onClick={() => toggle(c)}
                            className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
                          >
                            {c.enabled ? 'disable' : 'enable'}
                          </button>
                          <button
                            onClick={() => remove(c)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
