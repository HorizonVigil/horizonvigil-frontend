import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.error('Error fetching user or no user found:', error?.message);
        navigate('/auth'); // Redirect if user is not authenticated
      } else {
        setUserEmail(user.email);
      }
    };
    fetchUser();

    // Also subscribe to auth state changes to react to logout initiated elsewhere or session expiry
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event === 'SIGNED_OUT') {
        console.log('Dashboard: User signed out, redirecting.');
        navigate('/auth');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    } else {
      // The onAuthStateChange listener will handle navigation to /auth after SIGNED_OUT event
      console.log('Logged out successfully.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-white mb-4">
          Welcome to HorizonVigil Dashboard!
        </h1>
        {userEmail ? (
          <p className="text-lg text-gray-300 mb-8">
            Logged in as: <span className="font-semibold text-indigo-400">{userEmail}</span>
          </p>
        ) : (
          <p className="text-lg text-gray-300 mb-8">Fetching user data...</p>
        )}
        <button
          onClick={handleLogout}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-300 ease-in-out"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
