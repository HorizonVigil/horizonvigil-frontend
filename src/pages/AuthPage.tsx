import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { supabase } from '../lib/supabaseClient';

const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      if (session) {
        // User is logged in, redirect to dashboard
        navigate('/dashboard');
      } else if (event === 'SIGNED_OUT') {
        // User signed out, ensure we are on an unprotected route
        navigate('/auth');
      }
    });

    // Check current session on component mount to handle direct access to /auth when already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleAuthSuccess = () => {
    // This callback is primarily used by AuthForm to signal a successful action.
    // For login, the `onAuthStateChange` listener will handle navigation to dashboard
    // once the session is established. For signup, a message is displayed, and no
    // immediate navigation happens as email confirmation is often required.
    console.log('AuthForm success handler triggered.');
    // If it was a login, the listener would have already redirected.
    // If it was a signup, the message on the form informs the user to check email.
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          {isSignUp ? 'Create your account' : 'Sign in to your account'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Or{' '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 bg-transparent"
          >
            {isSignUp ? 'sign in to an existing account' : 'create a new account'}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <AuthForm isSignUp={isSignUp} onSuccess={handleAuthSuccess} />
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
