import React from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { UserProfile } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: UserProfile | null;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  return (
    <div className="min-h-screen bg-[#F5F7FA] font-sans text-[#1A1A1A]">
      <header className="bg-white border-b border-[#E5E5E5] px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Heard First Logo" className="w-10 h-10 rounded-lg" />
          <h1 className="text-xl font-bold tracking-tight">Heard First</h1>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#F0F4F8] px-3 py-1.5 rounded-full border border-[#D1D9E6]">
              <UserIcon className="w-4 h-4 text-[#4A90E2]" />
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#7F8C8D] bg-white px-1.5 py-0.5 rounded-md border border-[#D1D9E6] ml-1">
                {user.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="p-2 hover:bg-[#FEE2E2] hover:text-[#E74C3C] rounded-full transition-colors text-[#7F8C8D]"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
};
