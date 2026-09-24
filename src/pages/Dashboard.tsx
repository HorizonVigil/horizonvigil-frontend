import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../layout/RootLayout';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth(); // Get user and loading status from AuthContext

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      alert('Failed to log out: ' + error.message);
    } else {
      // Supabase's onAuthStateChange listener in RootLayout will update the session to null,
      // and AuthGuard will then redirect to /auth.
      // Optionally, navigate directly here if immediate redirect is desired over AuthGuard's watch.
      navigate('/auth', { replace: true }); 
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <p className="text-xl text-gray-400">Loading user data...</p>
      </div>
    );
  }

  return (
    <div className="text-center py-20 px-4">
      <h1 className="text-5xl font-bold text-green-400 mb-6">Welcome to Your Dashboard!</h1>
      <p className="text-xl text-gray-300 mb-4">
        You are logged in as <span className="font-semibold text-blue-300">{user?.email || 'Authenticated User'}</span>.
      </p>
      <p className="text-lg text-gray-400 mb-8 leading-relaxed">
        This is your central hub for all HorizonVigil monitoring and analytics.
        Prepare to gain deep insights into your systems.
      </p>

      <div className="max-w-3xl mx-auto bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-700">
        <h2 className="text-3xl font-semibold text-gray-200 mb-6">Your Projects Overview</h2>
        <p className="text-gray-400 mb-8 leading-loose">
          Soon you'll find real-time data visualizations, critical alerts, performance metrics, and configuration options for all your integrated services here.
          Start by connecting your first project to unlock powerful monitoring capabilities.
        </p>
        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-8 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
