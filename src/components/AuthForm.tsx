import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AuthError } from '@supabase/supabase-js';

interface AuthFormProps {
  onAuthSuccess: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    let authError: AuthError | null = null;
    let authData = null;

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      authError = error;
      authData = data;
    } else {
      // For sign up, Supabase usually sends a confirmation email
      const { data, error } = await supabase.auth.signUp({ email, password });
      authError = error;
      authData = data;
      if (!error && data.user && !data.session) {
        setMessage('Please check your email for a confirmation link to complete registration!');
        // Optionally, reset form or prevent further actions until email is confirmed
      }
    }

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else if (authData?.session) {
      onAuthSuccess(); // Call success callback for immediate login (sign-in or confirmed sign-up)
    }
  };

  return (
    <div className="bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-700 w-full max-w-md">
      <h2 className="text-4xl font-bold text-blue-400 mb-8 text-center">
        {isLogin ? 'Sign In' : 'Sign Up'}
      </h2>
      {error && <div className="bg-red-600 text-white p-3 rounded mb-4 text-center text-sm font-medium"><p>{error}</p></div>}
      {message && <div className="bg-green-600 text-white p-3 rounded mb-4 text-center text-sm font-medium"><p>{message}</p></div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-gray-300 text-sm font-bold mb-2">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 text-gray-100 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 placeholder-gray-400"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-gray-300 text-sm font-bold mb-2">
            Password
          </label>
          <input
            type="password"
            id="password"
            className="shadow appearance-none border border-gray-600 rounded w-full py-2 px-3 text-gray-100 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 placeholder-gray-400"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
          disabled={loading}
        >
          {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
        </button>
      </form>
      <div className="mt-8 text-center">
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError(null); // Clear errors when switching form type
            setMessage(null);
          }}
          className="text-blue-400 hover:text-blue-300 text-sm font-medium transition duration-200"
        >
          {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;
