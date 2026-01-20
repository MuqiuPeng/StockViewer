'use client';

import { useState, useEffect, ReactNode } from 'react';

interface MobileBlockerProps {
  children: ReactNode;
}

export default function MobileBlocker({ children }: MobileBlockerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Check user agent for mobile devices
      const userAgent = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '';
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

      // Also check screen width as a fallback
      const isSmallScreen = window.innerWidth < 768;

      // Check if it's a touch device with small screen (likely mobile, not tablet in desktop mode)
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      setIsMobile(mobileRegex.test(userAgent) || (isSmallScreen && isTouchDevice));
      setIsChecked(true);
    };

    checkMobile();

    // Re-check on resize (in case of orientation change or responsive mode)
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Don't render anything until we've checked
  if (!isChecked) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-6 z-[9999]">
        <div className="text-center max-w-md">
          {/* Computer Icon */}
          <div className="mb-6">
            <svg
              className="w-24 h-24 mx-auto text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            请使用电脑访问
          </h1>

          <p className="text-gray-400 mb-6">
            本应用包含复杂的图表和数据分析功能，需要较大的屏幕空间才能正常使用。
          </p>

          <p className="text-gray-500 text-sm">
            Please use a desktop computer or laptop to access this application.
          </p>

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-gray-500 text-xs">
              Stock Viewer
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
