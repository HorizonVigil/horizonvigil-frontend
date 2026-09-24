import React, { useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../layout/RootLayout';

const AuthGuard: React.FC = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      // If not loading and no session, redirect to authentication page
      navigate('/auth', { replace: true });
    }
  }, [session, loading, navigate]);

  if (loading || !session) {
    // While loading or if no session (and redirect is pending),
    // show a loading state or null to prevent content flicker
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <p className="text-xl text-gray-400">Authenticating...</p>
      </div>
    );
  }

  // If authenticated, render the child routes
  return <Outlet />;
};

export default AuthGuard;
