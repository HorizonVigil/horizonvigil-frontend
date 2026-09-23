import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
      if (!session) {
        navigate('/auth', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      // Optionally display an error message to the user
    } else {
      // onAuthStateChange will trigger navigation to /auth
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-200">
        <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="ml-2">Loading user data...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-extrabold text-white mb-6">Welcome to Your Dashboard!</h1>
      {user ? (
        <p className="text-xl text-gray-300 mb-8">Hello, <span className="font-semibold text-indigo-400">{user.email}</span>!</p>
      ) : (
        <p className="text-xl text-gray-300 mb-8">You are logged in.</p>
      )}

      <p className="text-lg leading-relaxed text-center max-w-2xl mb-10">
        This is your private space at HorizonVigil. Soon, you'll find powerful tools and insights here to manage your digital vigilance.
      </p>

      <button
        onClick={handleLogout}
        disabled={loading}
        className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg
                   transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75"
      >
        {loading ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  );
};

export default Dashboard;
