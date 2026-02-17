import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WizardFooterBarProps {
  onBack: () => void;
  backLabel?: string;
  onNext: () => void;
  nextLabel?: string;
  onHandoverToKanzlei?: () => void;
  handoverLabel?: string;
  disableNext?: boolean;
}

export function WizardFooterBar({
  onBack,
  backLabel = 'Zurück',
  onNext,
  nextLabel = 'Weiter',
  onHandoverToKanzlei,
  handoverLabel = 'Direkt an Kanzlei übergeben',
  disableNext = false,
}: WizardFooterBarProps) {
  return (
    <footer className="flex-shrink-0 bg-card border-t py-fluid-md px-fluid-lg">
      <div className="max-w-[90%] 2xl:max-w-[1720px] mx-auto flex items-center justify-between">
        {/* Left: Back button */}
        <Button variant="outline" onClick={onBack} className="text-fluid-sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Button>

        {/* Center: Handover to Kanzlei (optional) */}
        {onHandoverToKanzlei && (
          <Button
            variant="outline"
            onClick={onHandoverToKanzlei}
            className="text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50 text-fluid-sm"
          >
            {handoverLabel}
          </Button>
        )}

        {/* Right: Next button */}
        <Button onClick={onNext} disabled={disableNext} className="text-fluid-sm text-white">
          {nextLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </footer>
  );
}
