import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../layout/RootLayout';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      // If user is already authenticated and session exists, redirect to dashboard
      navigate('/dashboard', { replace: true });
    }
  }, [session, loading, navigate]);

  const handleAuthSuccess = () => {
    // This function is called by AuthForm on successful sign-in/sign-up that results in a session.
    // The useEffect hook above will handle the navigation automatically when the session state updates.
    // For sign-up where email confirmation is required, session might not be immediate.
    // In that case, the message from AuthForm will guide the user.
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <p className="text-xl text-gray-400">Loading authentication status...</p>
      </div>
    );
  }

  // If not loading and no session, show the AuthForm
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
      <AuthForm onAuthSuccess={handleAuthSuccess} />
    </div>
  );
};

export default AuthPage;
