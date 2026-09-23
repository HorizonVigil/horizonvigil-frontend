import { AuthForm } from '../components/AuthForm';
import { useSupabaseAuth } from '../lib/supabaseAuth';
import { Navigate, useLocation } from 'react-router-dom';

export function AuthPage() {
  const { session, isLoading } = useSupabaseAuth();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  if (session) {
    // If the user is already authenticated, redirect them away from the auth page.
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthForm />
    </div>
  );
}
