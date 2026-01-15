'use client';

import { ReactNode } from 'react';
import ThemeProvider from './ThemeProvider';
import Navbar from './Navbar';

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <ThemeProvider>
      <Navbar />
      <div className="pt-14">
        {children}
      </div>
    </ThemeProvider>
  );
}
