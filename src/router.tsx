import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import RootLayout, { AuthProvider } from './layout/RootLayout';
import AuthGuard from './components/AuthGuard';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AuthProvider><RootLayout /></AuthProvider>}> {/* AuthProvider wraps RootLayout for global auth context */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      {/* Protected Routes: Only accessible if authenticated */}
      <Route element={<AuthGuard />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      {/* Catch-all route for 404 Not Found */}
      <Route path="*" element={<div className="text-center py-20 text-3xl font-bold text-red-400">404 - Not Found</div>} />
    </Route>
  )
);

export default router;
