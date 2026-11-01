'use client';

import { ReactNode } from 'react';
import ThemeProvider from './ThemeProvider';
import SessionProvider from './SessionProvider';
import { SetupCheck } from './SetupCheck';
import Navbar from './Navbar';
import MobileBlocker from './MobileBlocker';

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <MobileBlocker>
          <SetupCheck>
            <Navbar />
            <div className="pt-14">
              {children}
            </div>
          </SetupCheck>
        </MobileBlocker>
      </ThemeProvider>
    </SessionProvider>
  );
}
