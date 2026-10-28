'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ArrowRight } from 'lucide-react';
import { fetchSetupStatus, fetchCurrentReviewer, logoutReviewer } from '../lib/api';
import { ReviewerProfile } from '../types';

interface AuthContextType {
  reviewer: ReviewerProfile | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  isOwnerOrAdmin: boolean;
  isEditorOrAbove: boolean;
  isViewer: boolean;
}

const AuthContext = createContext<AuthContextType>({
  reviewer: null,
  isLoading: true,
  logout: async () => {},
  isOwnerOrAdmin: false,
  isEditorOrAbove: false,
  isViewer: false,
});

export const useAuth = () => useContext(AuthContext);

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        // 1. Detect if fresh installation setup is required
        const setupRes = await fetchSetupStatus().catch(() => ({ isSetupRequired: false }));
        if (setupRes.isSetupRequired) {
          if (pathname !== '/setup') {
            router.replace('/setup');
            return;
          }
        }

        // 2. Validate active reviewer session
        const current = await fetchCurrentReviewer();
        if (!current) {
          if (pathname !== '/login' && pathname !== '/setup' && pathname !== '/accept-invite') {
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }
        }

        if (isMounted) {
          setReviewer(current);

          // 3. Verify role authorization if requiredRole specified
          if (current && requiredRole) {
            const roleRank: Record<string, number> = {
              OWNER: 40,
              ADMIN: 30,
              SECURITY_ADMIN: 30,
              EDITOR: 20,
              ANALYST: 20,
              VIEWER: 10,
            };
            const userRank = roleRank[current.role?.toUpperCase()] ?? 10;
            const reqRank = roleRank[requiredRole] ?? 10;

            if (userRank < reqRank) {
              setUnauthorizedMessage(
                `Access Restricted: This view requires '${requiredRole}' privileges, but your account is configured as '${current.role}'.`
              );
            }
          }
        }
      } catch {
        if (isMounted) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [pathname, router, requiredRole]);

  const handleLogout = async () => {
    await logoutReviewer();
    setReviewer(null);
    router.replace('/login');
  };

  const roleUpper = (reviewer?.role || '').toUpperCase();
  const isOwnerOrAdmin = roleUpper === 'OWNER' || roleUpper === 'ADMIN' || roleUpper === 'SECURITY_ADMIN';
  const isEditorOrAbove = isOwnerOrAdmin || roleUpper === 'EDITOR' || roleUpper === 'ANALYST';
  const isViewer = !isEditorOrAbove;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111215] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#D7FF70]/10 border border-[#D7FF70]/20 flex items-center justify-center text-[#D7FF70] animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">Validating Security Session...</p>
            <p className="text-xs text-[#8E929C]">Verifying defense node authentication &amp; role policies</p>
          </div>
        </div>
      </div>
    );
  }

  if (unauthorizedMessage) {
    return (
      <div className="min-h-screen bg-[#111215] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1C1E24] border border-white/[0.08] rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Access Restricted</h1>
            <p className="text-xs text-[#8E929C] leading-relaxed">
              {unauthorizedMessage}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-[#D7FF70] text-[#0E1400] text-sm font-bold hover:bg-[#c4f250] transition-colors btn-press min-h-[44px]"
            >
              <span>Return to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        reviewer,
        isLoading,
        logout: handleLogout,
        isOwnerOrAdmin,
        isEditorOrAbove,
        isViewer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
