import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSupabaseAuth } from '../lib/supabaseAuth';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { session, isLoading } = useSupabaseAuth();
  const location = useLocation();

  if (isLoading) {
    // Optionally render a loading spinner here
    return <div>Loading authentication...</div>;
  }

  if (!session) {
    // Redirect them to the /auth page, but save the current location they were
    // trying to go to when they were redirected. This allows us to send them
    // along to that page after they login, which is a nicer user experience
    // than dropping them off on the home page.
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
