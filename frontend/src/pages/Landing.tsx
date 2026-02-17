import { Link } from 'react-router-dom';
import { Building2, User, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/favicon.png" alt="BelegCockpit Logo" className="h-10 w-10" />
          <h1 className="text-4xl font-bold text-foreground">BelegCockpit</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-md">
          Beleg-Vollständigkeitsprüfung in 2 Minuten
        </p>
      </div>

      {/* Role Selection */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Mandant Card */}
        <Link to="/mandant" className="block">
          <Card className="h-full card-interactive hover:border-primary cursor-pointer">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <User className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Mandant öffnen</CardTitle>
              <CardDescription>
                Belege hochladen und Zahlungen zuordnen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Einfache Schritt-für-Schritt Anleitung
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Offene Posten gebündelt erledigen
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Unsichere Zuordnungen bestätigen
                </li>
              </ul>
              <Button className="w-full mt-6">
                Als Mandant starten
              </Button>
            </CardContent>
          </Card>
        </Link>

        {/* Kanzlei Card */}
        <Link to="/kanzlei" className="block">
          <Card className="h-full card-interactive hover:border-primary cursor-pointer">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Kanzlei öffnen</CardTitle>
              <CardDescription>
                Mandanten-Übersicht und Risiko-Analyse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Cluster-Dashboard für alle Mandanten
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Bulk-Aktionen für schnelle Bearbeitung
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Risk-Queue mit Priorisierung
                </li>
              </ul>
              <Button variant="outline" className="w-full mt-6">
                Als Kanzlei starten
              </Button>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Footer Info */}
      <p className="mt-12 text-sm text-muted-foreground">
        Demo-Daten: Januar 2026 • 300 Transaktionen • 200 Belege
      </p>
    </div>
  );
}
