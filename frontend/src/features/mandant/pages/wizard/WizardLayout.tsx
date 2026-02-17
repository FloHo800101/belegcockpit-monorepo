import { useState, createContext, useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FileText, Check, LayoutDashboard, User, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useBelegStore } from '@/store/belegStore';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { cn } from '@/lib/utils';

// Context for Eigenbeleg Dialog
interface EigenbelegContextType {
  openEigenbelegDialog: (txId: string) => void;
}

const EigenbelegContext = createContext<EigenbelegContextType | null>(null);

export function useEigenbelegDialog() {
  const context = useContext(EigenbelegContext);
  if (!context) {
    throw new Error('useEigenbelegDialog must be used within WizardLayout');
  }
  return context;
}

export default function WizardLayout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state, dispatch } = useBelegStore();
  const { 
    isNewMonth, 
    currentStep, 
    stepIndex, 
    monthLabel,
    monthId,
    goToDashboard,
    goToMeineDaten,
    goToKanzlei,
    goToLanding,
    goToSetup,
    goToOpenItems,
    goToUncertainMatches,
    goToCompletion
  } = useWizardNavigation();
  
  const { wizardSetup } = useBelegStore();

  // Eigenbeleg Dialog State
  const [eigenbelegTxId, setEigenbelegTxId] = useState<string | null>(null);
  const [eigenbelegData, setEigenbelegData] = useState({ occasion: 'sonstiges', note: '' });

  const eigenbelegTx = eigenbelegTxId ? state.transactions.find(t => t.id === eigenbelegTxId) : null;

  const openEigenbelegDialog = (txId: string) => {
    setEigenbelegTxId(txId);
  };

  const handleCreateEigenbeleg = (txId: string) => {
    dispatch({ type: 'UPDATE_TRANSACTION_STATUS', payload: { id: txId, status: 'resolved_self_receipt' } });
    setEigenbelegTxId(null);
    toast({ title: 'Eigenbeleg erstellt', description: 'Der Eigenbeleg wurde gespeichert.' });
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  // Step configuration for sidebar - always show all 4 steps
  const steps = [
    { id: 'setup', label: 'Upload', stepValue: 0, navigate: goToSetup },
    { id: 'offene-punkte', label: 'Offene Punkte', stepValue: 1, navigate: () => goToOpenItems(monthId || wizardSetup.selectedMonth) },
    { id: 'unsichere-matches', label: 'Zu prüfende Punkte', stepValue: 2, navigate: goToUncertainMatches },
    { id: 'abschluss', label: 'Abschluss', stepValue: 3, isCompletion: true, navigate: goToCompletion },
  ];
  
  // Determine which steps are accessible
  // Always allow navigation if we're on a later step (user already navigated there)
  const isStepAccessible = (stepValue: number) => {
    // Setup is always accessible
    if (stepValue === 0) return true;
    // If we're already on or past this step, it's accessible
    if (stepValue <= stepIndex) return true;
    // Otherwise, other steps require matching to be complete
    if (!wizardSetup.matchingComplete) return false;
    // All steps are accessible once matching is complete
    return true;
  };

  return (
    <EigenbelegContext.Provider value={{ openEigenbelegDialog }}>
      <div className="h-screen bg-background flex overflow-hidden">
        {/* Sidebar - Fluid width */}
        <aside className="w-sidebar bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0 flex flex-col">
          <div className="p-fluid-md border-b border-sidebar-border">
            <div 
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={goToLanding}
            >
              <FileText className="h-6 w-6 text-sidebar-primary" />
              <span className="font-semibold text-fluid-base">BelegCockpit</span>
            </div>
          </div>
          <div className="p-fluid-md">
            {/* Dashboard Link */}
            <button
              onClick={goToDashboard}
              className="flex items-center gap-2 px-3 py-2 rounded w-full text-left text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors mb-4 text-fluid-sm"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>
            
            <div className="text-fluid-sm text-sidebar-foreground/70 mb-2">Bearbeite</div>
            <div className="font-medium text-sidebar-foreground text-fluid-base">{monthLabel}</div>
            
            {/* Progress indicator */}
            <div className="mt-4 space-y-2">
              {steps.map((step, idx) => {
                const isActive = stepIndex === step.stepValue;
                const isPast = stepIndex > step.stepValue;
                const isCompleted = step.isCompletion && isActive;
                const accessible = isStepAccessible(step.stepValue);
                
                return (
                  <button 
                    key={step.id}
                    onClick={() => accessible && step.navigate()}
                    disabled={!accessible}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded text-fluid-sm w-full text-left transition-colors',
                      isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                      isPast && 'text-sidebar-foreground/70',
                      !isActive && !isPast && 'text-sidebar-foreground/50',
                      accessible && !isActive && 'hover:bg-sidebar-accent/50 cursor-pointer',
                      !accessible && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-xs',
                      isActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
                      isPast && 'bg-[hsl(var(--status-confident))] text-white',
                      !isActive && !isPast && 'bg-sidebar-border text-sidebar-foreground/50'
                    )}>
                      {isPast ? <Check className="h-3 w-3" /> : idx + 1}
                    </div>
                    {step.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Links */}
          <div className="mt-auto p-fluid-md border-t border-sidebar-border space-y-1">
            <button
              onClick={goToMeineDaten}
              className="flex items-center gap-2 px-3 py-2 rounded w-full text-left text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors text-fluid-sm"
            >
              <User className="h-4 w-4" />
              Meine Daten
            </button>
            <button
              onClick={goToKanzlei}
              className="flex items-center gap-2 px-3 py-2 rounded w-full text-left text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors text-fluid-sm"
            >
              <Building2 className="h-4 w-4" />
              Zur Kanzlei wechseln
            </button>
          </div>
        </aside>

        {/* Main Content - Full width, full height, no constraining wrapper */}
        <main className="flex-1 h-full overflow-hidden">
          <Outlet />
        </main>

        {/* Eigenbeleg Dialog */}
        <Dialog open={!!eigenbelegTxId} onOpenChange={() => setEigenbelegTxId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eigenbeleg erstellen</DialogTitle>
              <DialogDescription>
                {eigenbelegTx && `${eigenbelegTx.merchant} • ${formatCurrency(eigenbelegTx.amount)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Datum</Label>
                <Input type="date" defaultValue={eigenbelegTx?.date} />
              </div>
              <div>
                <Label>Betrag</Label>
                <Input type="number" defaultValue={eigenbelegTx ? Math.abs(eigenbelegTx.amount) : 0} />
              </div>
              <div>
                <Label>Anlass</Label>
                <Select value={eigenbelegData.occasion} onValueChange={v => setEigenbelegData(d => ({ ...d, occasion: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parken">Parken</SelectItem>
                    <SelectItem value="trinkgeld">Trinkgeld</SelectItem>
                    <SelectItem value="kleinmaterial">Kleinmaterial</SelectItem>
                    <SelectItem value="bewirtung">Bewirtung</SelectItem>
                    <SelectItem value="sonstiges">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notiz (optional)</Label>
                <Textarea value={eigenbelegData.note} onChange={e => setEigenbelegData(d => ({ ...d, note: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEigenbelegTxId(null)}>Abbrechen</Button>
                <Button onClick={() => eigenbelegTxId && handleCreateEigenbeleg(eigenbelegTxId)}>Eigenbeleg speichern</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </EigenbelegContext.Provider>
  );
}
