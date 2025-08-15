import { useAuthContext } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import React from 'react'; // Import React for React.ReactNode

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, session } = useAuthContext();

  // Log untuk debugging
  console.log('[ProtectedRoute] user:', user);
  console.log('[ProtectedRoute] session:', session);
  console.log('[ProtectedRoute] isLoading:', isLoading);

  // Handle loading state
  if (isLoading) {
    console.log('[ProtectedRoute] Waiting for auth...');
    return <PageLoader />;
  }

  // Check if user is authenticated
  const isAuthenticated = user && session;

  if (!isAuthenticated) {
    console.warn('[ProtectedRoute] No user or session, redirecting to login...');
    return <Navigate to="/login" replace />;
  }

  console.log('[ProtectedRoute] User authenticated:', user ? user.email : 'N/A');
  return <>{children}</>;
}