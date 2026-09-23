import { createBrowserRouter } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/auth',
    element: <AuthPage />,
  },
  {
    path: '/dashboard',
    element: <Dashboard />,
    // This is a placeholder. In a production app, you'd typically wrap this
    // in a protected route component or layout to enforce authentication at the route level.
    // Current implementation relies on AuthPage's listener and Dashboard's useEffect for redirection.
  },
]);
