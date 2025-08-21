import { useAuthContext } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import React from 'react'; // Import React for React.ReactNode

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, session } = useAuthContext();

  // Log untuk debugging (dapat dikommentari jika sudah stabil)
  // console.log('[ProtectedRoute] user:', user);
  // console.log('[ProtectedRoute] session:', session);
  // console.log('[ProtectedRoute] isLoading:', isLoading);

  // Handle loading state
  if (isLoading) {
    // console.log('[ProtectedRoute] Waiting for auth...');
    return <PageLoader />;
  }

  // Check if user is authenticated
  // Priority: Session is most important, user profile can be loaded later
  const isAuthenticated = session && session.access_token;

  if (!isAuthenticated) {
    console.warn('[ProtectedRoute] No valid session, redirecting to login...');
    return <Navigate to="/login" replace />;
  }

  // If we have session but no user profile yet, show loading
  if (!user) {
    console.log('[ProtectedRoute] Session valid but user profile loading...');
    return <PageLoader />;
  }

  console.log('[ProtectedRoute] User authenticated:', user ? user.email : 'N/A');
  return <>{children}</>;
}