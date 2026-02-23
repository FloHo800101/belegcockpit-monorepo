import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { FileText, Package, Users, User, Inbox, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useInquiryPackage } from '../stores/inquiryPackageStore';
import { supabase } from '@/lib/supabase';

// Generate breadcrumbs based on current path
// Note: Kanzlei-Überblick (Steuerberater) and Mandanten (Steuerfachangestellte) are parallel, not hierarchical
function useBreadcrumbs() {
  const location = useLocation();
  const params = useParams<{ id?: string; mandantId?: string; monthId?: string; queueId?: string; clusterKey?: string }>();
  
  const breadcrumbs: { label: string; path: string; isPage?: boolean }[] = [];
  
  const path = location.pathname;
  
  // Mandant name mapping
  const getMandantName = (mandantId: string | undefined): string => {
    const nameMap: Record<string, string> = {
      'mueller-gmbh': 'Müller GmbH',
      'bau-co-kg': 'Bau & Co KG',
      'friseur-koenig': 'Friseur König',
      'cafe-schmidt': 'Café Schmidt',
      'it-solutions-nord': 'IT Solutions Nord GmbH',
      'autohaus-meyer': 'Autohaus Meyer',
    };
    return mandantId ? (nameMap[mandantId] || mandantId) : 'Unbekannt';
  };
  
  // Cockpit (Mandanten-Übersicht for Steuerfachangestellte)
  if (path === '/kanzlei/mandanten-uebersicht') {
    breadcrumbs.push({ label: 'Mandanten-Übersicht', path: '', isPage: true });
  }
  // Arbeitskorb
  else if (path === '/kanzlei/arbeitskorb') {
    breadcrumbs.push({ label: 'Arbeitskorb', path: '', isPage: true });
  }
  // Mandant detail routes - start from Mandanten-Übersicht
  else if (path.includes('/mandant/')) {
    breadcrumbs.push({ label: 'Mandanten-Übersicht', path: '/kanzlei/mandanten-uebersicht' });
    
    const mandantId = params.id || params.mandantId;
    const mandantName = getMandantName(mandantId);
    
    // Determine month context
    const monthId = params.monthId || 'januar-2026';
    const monthName = monthId.replace('-', ' ').replace(/^\w/, c => c.toUpperCase());
    
    // Mandant cockpit
    if (path.match(/\/mandant\/[^/]+$/)) {
      breadcrumbs.push({ label: `${mandantName} – ${monthName}`, path: '', isPage: true });
    }
    // Risk queue
    else if (path.includes('/risk')) {
      breadcrumbs.push({ label: `${mandantName} – ${monthName}`, path: `/kanzlei/mandant/${mandantId}` });
      breadcrumbs.push({ label: 'Risikofälle', path: '', isPage: true });
    }
    // Cluster workbench (legacy route)
    else if (path.includes('/cluster/')) {
      const clusterKey = params.clusterKey;
      const clusterLabels: Record<string, string> = {
        'missing_receipts': 'Fehlende Belege',
        'ambiguous': 'Mehrdeutige Zuordnungen',
        'small_amounts': 'Kleinbeträge',
        'subscriptions': 'Wiederkehrend / Abos',
        'refunds': 'Erstattungen',
        'tax_risks': 'USt-/Steuerrisiken',
      };
      breadcrumbs.push({ label: `${mandantName} – ${monthName}`, path: `/kanzlei/mandant/${mandantId}` });
      breadcrumbs.push({ label: clusterLabels[clusterKey || ''] || 'Cluster', path: '', isPage: true });
    }
    // SFA Workbench (new route)
    else if (path.includes('/monat/') && path.includes('/cluster/')) {
      const queueLabels: Record<string, string> = {
        'missing_receipts': 'Fehlende Belege',
        'ambiguous': 'Mehrdeutige Zuordnungen',
        'small_amounts': 'Kleinbeträge',
        'subscriptions': 'Wiederkehrend / Abos',
        'refunds': 'Erstattungen',
        'tax_risks': 'USt-/Steuerrisiken',
      };
      breadcrumbs.push({ label: `${mandantName} – ${monthName}`, path: `/kanzlei/mandant/${mandantId}` });
      breadcrumbs.push({ label: queueLabels[params.queueId || ''] || 'Cluster', path: '', isPage: true });
    }
    // Rückfragenpaket
    else if (path.includes('/rueckfragen')) {
      breadcrumbs.push({ label: `${mandantName} – ${monthName}`, path: `/kanzlei/mandant/${mandantId}` });
      breadcrumbs.push({ label: 'Rückfragenpaket', path: '', isPage: true });
    }
  }
  
  return breadcrumbs;
}

// Check if we're in a mandant/month context for showing inquiry package button
function useMandantContext() {
  const location = useLocation();
  const params = useParams<{ id?: string; mandantId?: string; monthId?: string }>();
  
  const path = location.pathname;
  
  // Extract mandant and month from various route patterns
  if (path.includes('/mandant/')) {
    const mandantId = params.id || params.mandantId;
    const monthId = params.monthId || 'januar-2026'; // Default month for legacy routes
    return { mandantId, monthId, inContext: true };
  }
  
  return { mandantId: null, monthId: null, inContext: false };
}

export default function KanzleiLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const breadcrumbs = useBreadcrumbs();
  const { mandantId, monthId, inContext } = useMandantContext();
  const inquiryPackage = useInquiryPackage();

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // Set inquiry package context if we're in a mandant/month context
  useEffect(() => {
    if (inContext && mandantId && monthId) {
      inquiryPackage.setContext(mandantId, monthId);
    }
  }, [inContext, mandantId, monthId, inquiryPackage]);

  const inquiryCount = inquiryPackage.getItemCount();

  const navItems = [
    { label: 'Mandanten', path: '/kanzlei/mandanten-uebersicht', icon: Users },
    { label: 'Arbeitskorb', path: '/kanzlei/arbeitskorb', icon: Inbox },
  ];

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Sidebar - Kanzlei Style (darker, professional) */}
      <aside className="w-sidebar bg-slate-800 text-slate-100 border-r border-slate-700 flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="p-fluid-md border-b border-slate-700">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/')}
          >
            <FileText className="h-6 w-6 text-primary" />
            <span className="font-semibold text-fluid-base text-white">BelegCockpit</span>
            <span className="text-fluid-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">Kanzlei</span>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="p-fluid-md space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-md w-full text-left transition-colors text-fluid-sm',
                  active
                    ? 'bg-primary text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-fluid-md border-t border-slate-700 space-y-2">
          {/* Rückfragen Button */}
          {inContext && mandantId && monthId ? (
            <button
              onClick={() => navigate(`/kanzlei/mandant/${mandantId}/monat/${monthId}/rueckfragen`)}
              disabled={inquiryCount === 0}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md w-full text-left text-fluid-sm transition-colors',
                inquiryCount > 0 
                  ? 'text-white bg-primary/20 border border-primary/40 hover:bg-primary/30'
                  : 'text-slate-500 cursor-not-allowed'
              )}
            >
              <Package className="h-4 w-4" />
              Rückfragen {inquiryCount > 0 && `(${inquiryCount})`}
            </button>
          ) : (
            <button
              disabled
              className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left text-slate-500 cursor-not-allowed text-fluid-sm"
            >
              <Package className="h-4 w-4" />
              Rückfragen
            </button>
          )}
          
          {/* Switch to Mandant */}
          <button
            onClick={() => navigate('/mandant')}
            className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left text-slate-400 hover:bg-slate-700 hover:text-white transition-colors text-fluid-sm"
          >
            <User className="h-4 w-4" />
            Zum Mandant wechseln
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left text-slate-400 hover:bg-slate-700 hover:text-white transition-colors text-fluid-sm"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Bar with Breadcrumbs */}
        <header className="flex-shrink-0 border-b bg-card">
          <div className="flex items-center justify-between px-fluid-lg py-3">
            {/* Breadcrumbs */}
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={index}>
                    {index > 0 && <BreadcrumbSeparator />}
                    {crumb.isPage ? (
                      <BreadcrumbPage className="text-fluid-sm">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.path} className="text-fluid-sm">{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
