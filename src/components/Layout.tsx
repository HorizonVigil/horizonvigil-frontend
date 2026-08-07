import { Outlet } from 'react-router-dom';
import { AppRail } from './AppRail';
import { Sidebar } from './Sidebar';
import { ChatWidget } from './ChatWidget';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <AppRail />
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopBar />
        <main className="px-6 pb-10 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
