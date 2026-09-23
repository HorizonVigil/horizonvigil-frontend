import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AuthFormProps {
  isSignUp: boolean;
  onSuccess: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ isSignUp, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const handler = isSignUp ? supabase.auth.signUp : supabase.auth.signInWithPassword;

    try {
      const { data, error } = await handler({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        if (isSignUp) {
          // Supabase's signUp by default sends a confirmation email
          setMessage('Signup successful! Please check your email to confirm your account, then you can log in.');
          // For signup, we don't immediately call onSuccess because user needs to confirm email
        } else {
          // For signInWithPassword, if successful, data.session will be present
          if (data.session) {
            setMessage('Login successful!');
            onSuccess(); // Callback to parent to handle navigation if session is active
          } else if (data.user && !data.session) {
            // This case might occur if email confirmation is required and user hasn't confirmed yet.
            setError('Please confirm your email address to log in.');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300">
          Email address
        </label>
        <div className="mt-1">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="appearance-none block w-full px-3 py-2 border border-gray-700 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-gray-800 text-white"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300">
          Password
        </label>
        <div className="mt-1">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="appearance-none block w-full px-3 py-2 border border-gray-700 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-gray-800 text-white"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : (isSignUp ? 'Sign up' : 'Sign in')}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-center text-sm text-green-500">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-center text-sm text-red-500">
          {error}
        </p>
      )}
    </form>
  );
};

export default AuthForm;
