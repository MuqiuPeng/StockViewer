'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

/**
 * Component that checks if user has completed setup.
 * In database mode, setup is auto-completed (no CSV folder needed).
 * In local mode, redirects to /setup if not complete.
 */
export function SetupCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [setupChecked, setSetupChecked] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(true);

  useEffect(() => {
    async function checkSetup() {
      // Skip check if on setup or auth pages
      if (pathname?.startsWith('/setup') || pathname?.startsWith('/auth')) {
        setSetupChecked(true);
        return;
      }

      const storageMode = process.env.NEXT_PUBLIC_STORAGE_MODE;

      // In database mode, auto-complete setup (no CSV folder needed)
      if (storageMode === 'database') {
        // Wait for session to load
        if (status === 'loading') return;

        // If authenticated, auto-complete setup silently
        if (session?.user) {
          try {
            const res = await fetch('/api/user-settings');
            if (res.ok) {
              const data = await res.json();
              if (!data.settings?.setupComplete) {
                // Auto-complete setup for database mode
                await fetch('/api/user-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ setupComplete: true }),
                });
              }
            }
          } catch (err) {
            console.error('Error auto-completing setup:', err);
          }
        }
        setSetupChecked(true);
        return;
      }

      // Local mode: check if setup is complete
      // Wait for session to load
      if (status === 'loading') return;

      // Skip if not authenticated
      if (!session?.user) {
        setSetupChecked(true);
        return;
      }

      try {
        const res = await fetch('/api/user-settings');
        if (res.ok) {
          const data = await res.json();
          if (!data.settings?.setupComplete) {
            setIsSetupComplete(false);
            router.push('/setup');
            return;
          }
        }
      } catch (err) {
        console.error('Error checking setup:', err);
      }

      setSetupChecked(true);
    }

    checkSetup();
  }, [session, status, pathname, router]);

  // Show loading while checking setup
  if (!setupChecked && status !== 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // If setup not complete and not on setup page, don't render children
  if (!isSetupComplete && !pathname?.startsWith('/setup')) {
    return null;
  }

  return <>{children}</>;
}
