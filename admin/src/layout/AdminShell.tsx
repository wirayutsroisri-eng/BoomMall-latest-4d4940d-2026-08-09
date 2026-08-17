import { Outlet } from 'react-router-dom';
import { ShellProvider, useShell } from './ShellContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function ShellFrame() {
  const { collapsed } = useShell();
  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      <TopBar />
      <Sidebar />
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminShell() {
  return (
    <ShellProvider>
      <ShellFrame />
    </ShellProvider>
  );
}
