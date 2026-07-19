import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatWidget } from './ChatWidget';
import { useTheme } from '../lib/theme';

export function Layout() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="flex justify-end px-6 pt-3">
          <button onClick={toggleTheme} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
        <main className="px-6 pb-10 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
