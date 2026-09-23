import { useSupabaseAuth } from '../lib/supabaseAuth';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const { user, signOut } = useSupabaseAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Welcome to HorizonVigil!</h1>
        {user ? (
          <p className="text-lg text-gray-600 mb-6">You are logged in as <span className="font-semibold">{user.email}</span></p>
        ) : (
          <p className="text-lg text-gray-600 mb-6">You are logged in.</p>
        )}
        <p className="text-md text-gray-700 mb-8">This is your secure dashboard.</p>
        <button
          onClick={handleSignOut}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-200"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
