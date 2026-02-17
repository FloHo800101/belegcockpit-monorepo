import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HandoverMonthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  openCount: number;
  reviewCount: number;
}

export function HandoverMonthDialog({
  open,
  onOpenChange,
  onConfirm,
  openCount,
  reviewCount,
}: HandoverMonthDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Monat an Kanzlei übergeben?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Du kannst diesen Schritt überspringen. Die Kanzlei klärt den Rest. 
                Du kannst später jederzeit wieder einsteigen.
              </p>
              <p className="text-sm text-muted-foreground border-t pt-3">
                Aktueller Stand: <strong>{openCount} offene Punkte</strong> · <strong>{reviewCount} Zuordnungen zum Prüfen</strong>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            An Kanzlei übergeben
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
