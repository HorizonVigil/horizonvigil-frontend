import React, { useState } from 'react';
import { useSupabaseAuth } from '../lib/supabaseAuth';
import { useNavigate } from 'react-router-dom';

export function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signInWithEmailPassword, signUpWithEmailPassword, signInWithOAuth } = useSupabaseAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { user } = await signUpWithEmailPassword(email, password);
        if (user) {
            setMessage('Sign up successful! Please check your email for a confirmation link.');
            // Supabase's default behavior requires email confirmation.
            // User might not be immediately 'session' active until confirmed.
            // For this example, we'll let AuthPage handle the redirect based on session.
        } else {
            setMessage('Sign up successful! You can now log in.');
            setIsSignUp(false); // Switch to login mode after successful signup
        }

      } else {
        await signInWithEmailPassword(email, password);
        // Navigating upon successful login is handled by AuthPage or RequireAuth.
      }
    } catch (error: any) {
      console.error('Authentication error:', error.message);
      setMessage(error.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'github' | 'google') => {
    setLoading(true);
    setMessage('');
    try {
      await signInWithOAuth(provider);
      // OAuth sign-in typically redirects automatically.
    } catch (error: any) {
      console.error('OAuth sign-in error:', error.message);
      setMessage(error.message || `Failed to sign in with ${provider}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg">
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-6">
          {isSignUp ? 'Create an Account' : 'Sign In to HorizonVigil'}
        </h2>

        {message && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative mb-4"
               role="alert">
            <span className="block sm:inline">{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? (isSignUp ? 'Signing Up...' : 'Signing In...') : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col space-y-3">
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 16 16">
                <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.151 16 8 16A8 8 0 0 1 8 0a7.65 7.65 0 0 1 5.356 2.376l-1.397 1.397A5.407 5.407 0 0 0 8 2.222A5.766 5.766 0 0 0 2.251 8c0 3.01 2.76 5.444 5.75 5.444s5.75-2.434 5.75-5.444c0-.39-.035-.76-.089-1.12h-6.15V6.558h7.94z"/>
              </svg>
              Google
            </button>
            <button
              onClick={() => handleOAuthSignIn('github')}
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.007-.866-.012-1.7a6.494 6.494 0 01-1.804 1.17c-.773.204-.937-.363-.937-.363-.664-1.416-1.619-1.792-1.619-1.792-1.32-.897.098-.879.098-.879 1.46.101 2.221 1.5 2.221 1.5 1.312 2.21 3.447 1.572 4.28 1.2.13-.936.516-1.572.94-1.93-3.262-.371-6.696-1.637-6.696-7.27C5.5 6.166 6.51 5.345 7.042 4.67C6.91 4.341 6.643 3.515 7.373 2.502c0 0 .97-.315 3.167 1.17C11.55 3.42 12.015 3.3 12.49 3.3c.475 0 .94.12 1.385.352 2.196-1.485 3.166-1.17 3.166-1.17.73.993.463 1.819.331 2.148.533.675 1.543 1.496 1.543 3.684 0 5.65-3.44 6.896-6.706 7.265.536.46.996 1.357.996 2.734 0 1.97-.017 3.559-.017 4.04 0 .268.181.578.688.482C21.137 20.198 24 16.442 24 12.017 24 6.484 19.523 2 14 2h-2z" clipRule="evenodd"/>
              </svg>
              GitHub
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setMessage('');
              }}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
