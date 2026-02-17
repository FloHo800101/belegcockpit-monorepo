import { useState, useMemo } from 'react';
import { Check, Mail, ArrowLeft, Send, PartyPopper, TrendingUp, Sparkles, Bot, UserCheck, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBelegStore } from '@/store/belegStore';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

// Mock data for auto-match statistics per month
const monthlyStats: Record<string, {
  totalTransactions: number;
  autoMatched: number;
  manuallyResolved: number;
  handedOver: number;
}> = {
  'januar-2026': { totalTransactions: 142, autoMatched: 118, manuallyResolved: 18, handedOver: 6 },
  'dezember-2025': { totalTransactions: 156, autoMatched: 134, manuallyResolved: 16, handedOver: 6 },
  'november-2025': { totalTransactions: 138, autoMatched: 112, manuallyResolved: 20, handedOver: 6 },
  'oktober-2025': { totalTransactions: 145, autoMatched: 116, manuallyResolved: 22, handedOver: 7 },
  'september-2025': { totalTransactions: 132, autoMatched: 102, manuallyResolved: 24, handedOver: 6 },
  'august-2025': { totalTransactions: 128, autoMatched: 95, manuallyResolved: 26, handedOver: 7 },
};

// Trend data for sparkline (last 6 months)
const trendData = [
  { month: 'Aug', rate: 74 },
  { month: 'Sep', rate: 77 },
  { month: 'Okt', rate: 80 },
  { month: 'Nov', rate: 81 },
  { month: 'Dez', rate: 86 },
  { month: 'Jan', rate: 83 },
];

export default function Completion() {
  const { counts } = useBelegStore();
  const { goToDashboard, goToOpenItemsHandler } = useWizardNavigation();
  const { monthId } = useParams();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [handoverDate, setHandoverDate] = useState<Date | null>(null);

  // Get stats for current month
  const currentStats = useMemo(() => {
    const stats = monthlyStats[monthId || 'januar-2026'] || monthlyStats['januar-2026'];
    const autoMatchRate = Math.round((stats.autoMatched / stats.totalTransactions) * 100);
    
    // Calculate previous month comparison
    const prevMonthId = monthId === 'januar-2026' ? 'dezember-2025' : 'november-2025';
    const prevStats = monthlyStats[prevMonthId];
    const prevRate = Math.round((prevStats.autoMatched / prevStats.totalTransactions) * 100);
    const rateDiff = autoMatchRate - prevRate;
    
    // Calculate 3-month average
    const threeMonthAvg = Math.round((
      (monthlyStats['november-2025'].autoMatched / monthlyStats['november-2025'].totalTransactions) +
      (monthlyStats['oktober-2025'].autoMatched / monthlyStats['oktober-2025'].totalTransactions) +
      (monthlyStats['september-2025'].autoMatched / monthlyStats['september-2025'].totalTransactions)
    ) / 3 * 100);
    const avgDiff = autoMatchRate - threeMonthAvg;
    
    return {
      ...stats,
      autoMatchRate,
      prevRate,
      rateDiff,
      threeMonthAvg,
      avgDiff,
    };
  }, [monthId]);

  // Calculate done and in-review counts
  const countDone = counts.confident + counts.resolved;
  const countInReview = counts.uncertain + counts.missing;

  const handleSubmitToKanzlei = () => {
    setHandoverDate(new Date());
    setIsSubmitted(true);
  };

  // Determine if this is a past month (already submitted)
  const isPastMonth = monthId && monthId !== 'januar-2026';

  // For past months, show the post-submission view directly
  if (isPastMonth || isSubmitted) {
    const formattedDate = handoverDate 
      ? format(handoverDate, "d. MMMM yyyy", { locale: de }) 
      : isPastMonth 
        ? format(new Date(2025, monthId === 'dezember-2025' ? 11 : 10, 15), "d. MMMM yyyy", { locale: de })
        : '';
    const formattedTime = handoverDate ? format(handoverDate, 'HH:mm', { locale: de }) : '14:32';

    return (
      <div className="min-h-full flex flex-col">
        <div className="flex-1 py-8 px-6 overflow-auto">
          <div className="max-w-3xl mx-auto space-y-8">
            {/* Success Header */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mx-auto">
                <PartyPopper className="h-8 w-8 text-[hsl(var(--status-confident))]" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  Geschafft – Übergabe gesendet!
                </h1>
                <p className="text-muted-foreground">
                  Übergabe am {formattedDate} um {formattedTime} Uhr
                </p>
              </div>
            </div>

            {/* Auto-Match Statistics Card */}
            <Card className="border-border">
              <CardContent className="pt-6 space-y-6">
                {/* Main Stat */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Automatische Zuordnung</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-bold text-foreground">{currentStats.autoMatchRate}%</span>
                      <span className="text-lg text-muted-foreground">
                        ({currentStats.autoMatched} von {currentStats.totalTransactions})
                      </span>
                    </div>
                  </div>
                  
                  {/* Mini Trend Chart */}
                  <div className="w-32 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <defs>
                          <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <YAxis domain={[60, 100]} hide />
                        <Area 
                          type="monotone" 
                          dataKey="rate" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          fill="url(#colorRate)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-muted-foreground text-center mt-0.5">Letzte 6 Monate</p>
                  </div>
                </div>

                {/* Comparison badges */}
                <div className="flex flex-wrap gap-2">
                  {currentStats.rateDiff !== 0 && (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      currentStats.rateDiff > 0 
                        ? 'bg-[hsl(var(--status-confident))]/10 text-[hsl(var(--status-confident))]'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      <TrendingUp className={`h-4 w-4 ${currentStats.rateDiff < 0 ? 'rotate-180' : ''}`} />
                      {currentStats.rateDiff > 0 ? '+' : ''}{currentStats.rateDiff}% vs. Vormonat
                    </div>
                  )}
                  {currentStats.avgDiff !== 0 && (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      currentStats.avgDiff > 0 
                        ? 'bg-[hsl(var(--status-confident))]/10 text-[hsl(var(--status-confident))]'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      <TrendingUp className={`h-4 w-4 ${currentStats.avgDiff < 0 ? 'rotate-180' : ''}`} />
                      {currentStats.avgDiff > 0 ? '+' : ''}{currentStats.avgDiff}% vs. Ø 3 Monate
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-3 gap-4">
              {/* Auto-matched */}
              <Card className="border-border">
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {currentStats.autoMatched}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Automatisch zugeordnet
                  </div>
                </CardContent>
              </Card>

              {/* Manually resolved */}
              <Card className="border-border">
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="h-5 w-5 text-[hsl(var(--status-confident))]" />
                  </div>
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {currentStats.manuallyResolved}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Von dir erledigt
                  </div>
                </CardContent>
              </Card>

              {/* Handed over */}
              <Card className="border-border">
                <CardContent className="pt-5 pb-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                    <Briefcase className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {currentStats.handedOver}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Kanzlei übernimmt
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Success Note */}
            <div className="bg-[hsl(var(--status-confident))]/5 border border-[hsl(var(--status-confident))]/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-[hsl(var(--status-confident))] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sehr gute Zuordnungsqualität
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentStats.autoMatchRate >= 80 
                      ? 'Deine Belege wurden überdurchschnittlich gut automatisch erkannt. Weiter so!'
                      : 'Tipp: Fotos mit besserer Qualität verbessern die automatische Erkennung.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="bg-muted/40 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-medium text-foreground">
                Das passiert jetzt
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-primary">1</span>
                  </div>
                  <span>Deine Kanzlei prüft die offenen Punkte</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-primary">2</span>
                  </div>
                  <span>Bei Rückfragen bekommst du eine E-Mail</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-primary">3</span>
                  </div>
                  <span>Du kannst jederzeit Belege nachreichen</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="flex-shrink-0 border-t bg-card px-6 py-4">
          <div className="max-w-4xl mx-auto flex justify-center">
            <Button size="lg" onClick={goToDashboard}>
              Zum Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Pre-submission state: "Bereit zur Übergabe"
  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center py-12 px-6">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Send className="h-10 w-10 text-primary" strokeWidth={1.5} />
          </div>

          {/* Headline & Subline */}
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Bereit zur Übergabe
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Du hast alles Wichtige erledigt. Die restlichen Punkte übernimmt deine Kanzlei – 
              du musst dich um nichts mehr kümmern.
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Done Card */}
            <Card className="border-border bg-card">
              <CardContent className="pt-6 pb-5 text-center">
                <div className="text-4xl font-bold text-[hsl(var(--status-confident))] mb-2">
                  {countDone}
                </div>
                <div className="text-sm font-medium text-foreground">
                  Erledigt
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Von dir abgeschlossen
                </p>
              </CardContent>
            </Card>

            {/* In Review Card */}
            <Card className="border-border bg-card">
              <CardContent className="pt-6 pb-5 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">
                  {countInReview}
                </div>
                <div className="text-sm font-medium text-foreground">
                  Zur Prüfung
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Kanzlei übernimmt
                </p>
              </CardContent>
            </Card>
          </div>

          {/* What happens next */}
          <div className="bg-muted/40 rounded-lg p-4 text-left">
            <h3 className="text-sm font-medium text-foreground mb-2">
              Was passiert als Nächstes?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nach der Übergabe prüft deine Kanzlei die offenen Punkte. 
              Falls noch etwas fehlt, wirst du per E-Mail benachrichtigt. 
              Ansonsten bist du fertig.
            </p>
          </div>

          {/* Submit Button */}
          <Button size="lg" onClick={handleSubmitToKanzlei} className="w-full max-w-xs mx-auto">
            <Send className="mr-2 h-4 w-4" />
            An Kanzlei übergeben
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="flex-shrink-0 border-t bg-card px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-start">
          <Button variant="outline" onClick={goToOpenItemsHandler}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
          </Button>
        </div>
      </div>
    </div>
  );
}
