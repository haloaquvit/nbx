import { useAuthContext } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import React from 'react'; // Import React for React.ReactNode

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, session } = useAuthContext();


  // Handle loading state
  if (isLoading) {
    return <PageLoader />;
  }

  // Check if user is authenticated
  // Priority: Session is most important, user profile can be loaded later
  const isAuthenticated = session && session.access_token;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If we have session but no user profile yet, show loading
  if (!user) {
    return <PageLoader />;
  }

  return <>{children}</>;
}