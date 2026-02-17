import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { FileText, LayoutDashboard, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MandantLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', path: '/mandant', icon: LayoutDashboard },
    { label: 'Meine Daten', path: '/mandant/meine-daten', icon: User },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Fluid width */}
      <aside className="w-sidebar bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0">
        <div className="p-fluid-md border-b border-sidebar-border">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/')}
          >
            <FileText className="h-6 w-6 text-sidebar-primary" />
            <span className="font-semibold text-fluid-base">BelegCockpit</span>
          </div>
        </div>
        <nav className="p-fluid-md space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded w-full text-left transition-colors text-fluid-sm',
                  isActive(item.path)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        
        {/* Rollen-Wechsel */}
        <div className="mt-auto p-fluid-md border-t border-sidebar-border">
          <button
            onClick={() => navigate('/kanzlei')}
            className="flex items-center gap-2 px-3 py-2 rounded w-full text-left text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors text-fluid-sm"
          >
            <Building2 className="h-4 w-4" />
            Zur Kanzlei wechseln
          </button>
        </div>
      </aside>

      {/* Main - Fluid padding */}
      <main className="flex-1 p-fluid-lg overflow-auto">
        <div className="max-w-[90%] 2xl:max-w-[1720px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
