import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { RequireAuth } from './components/RequireAuth';
import { useSupabaseAuth } from './lib/supabaseAuth';

// Note: For a real application, you'd likely want a more comprehensive router
// with lazy loading for protected routes, error boundaries, etc. This is a
// minimal setup to demonstrate the auth flow.

export function AppRouter() {
  const { session, isLoading } = useSupabaseAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading app...</div>;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />}
      />
      <Route path="/auth" element={<AuthPage />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />

      {/* Fallback for unmatched routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
