import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Check, X, Minus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewItem } from './ReviewInspector';

interface MatchScoreBreakdown {
  amountScore: number;
  amountMax: number;
  amountStatus: 'exact' | 'minor' | 'deviation';
  amountDetails: string;
  transactionAmount: number;
  documentAmount: number;

  dateScore: number;
  dateMax: number;
  dateDetails: string;
  transactionDate: string;
  documentDate: string;
  daysDiff: number;

  textScore: number;
  textMax: number;
  textStatus: 'high' | 'medium' | 'low';
  textDetails: string;
  transactionMerchant: string;
  documentSupplier: string;

  directionScore: number;
  directionMax: number;
  directionCorrect: boolean;
  directionDetails: string;

  totalScore: number;
  totalMax: number;
  confidencePercent: number;
}

function calculateTextSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, ' ').trim();
  const words1 = new Set(normalize(str1).split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(normalize(str2).split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let matches = 0;
  words1.forEach(word => {
    if (words2.has(word)) matches++;
    else {
      // Partial match check
      words2.forEach(w2 => {
        if (w2.includes(word) || word.includes(w2)) matches += 0.5;
      });
    }
  });
  
  return Math.min(1, matches / Math.max(words1.size, words2.size));
}

function dateDiffInDays(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function calculateMatchScore(reviewItem: ReviewItem): MatchScoreBreakdown {
  const transactionAmount = Math.abs(reviewItem.transactionAmount);
  const documentAmount = reviewItem.documentAmount;
  // Use documentName as supplier fallback (ReviewItem doesn't have documentSupplier)
  const documentSupplier = reviewItem.documentName || 'N/A';
  
  // 1. Betragsübereinstimmung (max 40 Punkte)
  const amountDiff = Math.abs(transactionAmount - documentAmount);
  let amountScore = 40;
  let amountStatus: 'exact' | 'minor' | 'deviation' = 'exact';
  let amountDetails = 'Exakte Übereinstimmung (±2 Cent)';
  
  if (amountDiff > 0.02) {
    const percentDiff = (amountDiff / documentAmount) * 100;
    if (percentDiff <= 1) {
      amountScore = 38;
      amountStatus = 'minor';
      amountDetails = `≤1% Abweichung (${amountDiff.toFixed(2)} €)`;
    } else if (percentDiff <= 5) {
      amountScore = 30;
      amountStatus = 'minor';
      amountDetails = `≤5% Abweichung (${amountDiff.toFixed(2)} €)`;
    } else if (percentDiff <= 10) {
      amountScore = 15;
      amountStatus = 'deviation';
      amountDetails = `≤10% Abweichung (${amountDiff.toFixed(2)} €)`;
    } else {
      amountScore = 0;
      amountStatus = 'deviation';
      amountDetails = `>10% Abweichung (${amountDiff.toFixed(2)} €)`;
    }
  }

  // 2. Datumsübereinstimmung (max 30 Punkte)
  const daysDiff = dateDiffInDays(reviewItem.transactionDate, reviewItem.documentDate);
  const dateScore = Math.max(0, 30 - (daysDiff * 2));
  let dateDetails = daysDiff === 0 ? 'Gleiches Datum' : `${daysDiff} Tag${daysDiff > 1 ? 'e' : ''} Differenz`;

  // 3. Textähnlichkeit (max 20 Punkte)
  const similarity = calculateTextSimilarity(
    reviewItem.transactionMerchant || '',
    documentSupplier
  );
  const textScore = Math.round(similarity * 20);
  let textStatus: 'high' | 'medium' | 'low' = 'low';
  let textDetails = 'Geringe Übereinstimmung';
  
  if (similarity >= 0.7) {
    textStatus = 'high';
    textDetails = 'Hohe Übereinstimmung';
  } else if (similarity >= 0.4) {
    textStatus = 'medium';
    textDetails = 'Mittlere Übereinstimmung';
  }

  // 4. Buchungsrichtung (max 10 Punkte)
  const isOutgoing = reviewItem.transactionAmount < 0;
  // Vereinfacht: Ausgang passt zu Rechnung (die meisten Belege sind Rechnungen)
  const directionCorrect = isOutgoing;
  const directionScore = directionCorrect ? 10 : 5; // Teilpunkte wenn Richtung anders
  const directionDetails = isOutgoing 
    ? 'Ausgehende Zahlung → Rechnung ✓' 
    : 'Eingehende Zahlung → Gutschrift/Erstattung';

  const totalScore = amountScore + dateScore + textScore + directionScore;
  const totalMax = 100;

  return {
    amountScore,
    amountMax: 40,
    amountStatus,
    amountDetails,
    transactionAmount,
    documentAmount,
    
    dateScore,
    dateMax: 30,
    dateDetails,
    transactionDate: reviewItem.transactionDate,
    documentDate: reviewItem.documentDate,
    daysDiff,
    
    textScore,
    textMax: 20,
    textStatus,
    textDetails,
    transactionMerchant: reviewItem.transactionMerchant || 'N/A',
    documentSupplier,
    
    directionScore,
    directionMax: 10,
    directionCorrect,
    directionDetails,
    
    totalScore,
    totalMax,
    confidencePercent: Math.round((totalScore / totalMax) * 100),
  };
}

interface MatchScoreAnalyseDialogProps {
  open: boolean;
  onClose: () => void;
  breakdown: MatchScoreBreakdown;
}

function ScoreIcon({ score, max }: { score: number; max: number }) {
  const ratio = score / max;
  if (ratio >= 0.9) return <Check className="h-4 w-4 text-green-600" />;
  if (ratio >= 0.5) return <Minus className="h-4 w-4 text-amber-500" />;
  return <X className="h-4 w-4 text-red-500" />;
}

function ScoreRow({ 
  label, 
  score, 
  max, 
  details, 
  leftLabel, 
  leftValue, 
  rightLabel, 
  rightValue 
}: { 
  label: string;
  score: number;
  max: number;
  details: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
}) {
  const ratio = score / max;
  const barColor = ratio >= 0.9 ? 'bg-green-500' : ratio >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
  
  return (
    <div className="border-t border-border pt-4 pb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ScoreIcon score={score} max={max} />
          <span className="font-medium text-sm">{label}</span>
        </div>
        <span className={cn(
          "text-sm font-semibold px-2 py-0.5 rounded",
          ratio >= 0.9 ? "bg-green-100 text-green-700" : 
          ratio >= 0.5 ? "bg-amber-100 text-amber-700" : 
          "bg-red-100 text-red-700"
        )}>
          {score}/{max}
        </span>
      </div>
      
      <p className="text-xs text-muted-foreground mb-2 ml-6">{details}</p>
      
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3 ml-6">
        <div 
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${(score / max) * 100}%` }}
        />
      </div>
      
      {/* Comparison values */}
      <div className="grid grid-cols-2 gap-2 ml-6">
        <div className="bg-muted/50 rounded px-3 py-2">
          <p className="text-xs text-muted-foreground">{leftLabel}</p>
          <p className="text-sm font-medium truncate" title={leftValue}>{leftValue}</p>
        </div>
        <div className="bg-muted/50 rounded px-3 py-2">
          <p className="text-xs text-muted-foreground">{rightLabel}</p>
          <p className="text-sm font-medium truncate" title={rightValue}>{rightValue}</p>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function MatchScoreAnalyseDialog({ open, onClose, breakdown }: MatchScoreAnalyseDialogProps) {
  const getConfidenceColor = (percent: number) => {
    if (percent >= 85) return 'text-green-600';
    if (percent >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match-Score Analyse</DialogTitle>
          <DialogDescription>
            Aufschlüsselung der automatischen Zuordnung
          </DialogDescription>
        </DialogHeader>

        {/* Main score display */}
        <div className="text-center py-6 bg-muted/30 rounded-lg">
          <p className={cn(
            "text-5xl font-bold",
            getConfidenceColor(breakdown.confidencePercent)
          )}>
            {breakdown.confidencePercent}%
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Gesamtscore ({breakdown.totalScore}/{breakdown.totalMax} Punkte)
          </p>
        </div>

        {/* Score breakdown */}
        <div className="space-y-1">
          <ScoreRow
            label="Betragsübereinstimmung"
            score={breakdown.amountScore}
            max={breakdown.amountMax}
            details={breakdown.amountDetails}
            leftLabel="Beleg:"
            leftValue={formatCurrency(breakdown.documentAmount)}
            rightLabel="Transaktion:"
            rightValue={formatCurrency(breakdown.transactionAmount)}
          />
          
          <ScoreRow
            label="Datumsübereinstimmung"
            score={breakdown.dateScore}
            max={breakdown.dateMax}
            details={breakdown.dateDetails}
            leftLabel="Beleg:"
            leftValue={formatDate(breakdown.documentDate)}
            rightLabel="Transaktion:"
            rightValue={formatDate(breakdown.transactionDate)}
          />
          
          <ScoreRow
            label="Textähnlichkeit (Lieferant ↔ Gegenkonto)"
            score={breakdown.textScore}
            max={breakdown.textMax}
            details={breakdown.textDetails}
            leftLabel="Beleg:"
            leftValue={breakdown.documentSupplier}
            rightLabel="Transaktion:"
            rightValue={breakdown.transactionMerchant}
          />
          
          <ScoreRow
            label="Buchungsrichtung"
            score={breakdown.directionScore}
            max={breakdown.directionMax}
            details={breakdown.directionDetails}
            leftLabel="Erwartung:"
            leftValue="Ausgehende Zahlung"
            rightLabel="Tatsächlich:"
            rightValue={breakdown.transactionAmount < 0 ? "Ausgang (−)" : "Eingang (+)"}
          />
        </div>

        {/* Calculation rules */}
        <div className="border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Berechnungsregeln</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 ml-6">
            <li>• <strong>Betrag:</strong> Exakt = 40 Pkt, ≤1% = 38 Pkt, ≤5% = 30 Pkt, ≤10% = 15 Pkt</li>
            <li>• <strong>Datum:</strong> Max 30 Pkt, −2 Pkt pro Tag Differenz (max 14 Tage)</li>
            <li>• <strong>Text:</strong> Wort-Übereinstimmung Lieferant ↔ Gegenkonto</li>
            <li>• <strong>Richtung:</strong> Ausgang = Rechnung (10 Pkt), Eingang = Gutschrift (5 Pkt)</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
