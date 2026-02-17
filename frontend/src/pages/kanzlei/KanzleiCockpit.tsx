import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { mockMandanten } from '@/data/arbeitskorbMandanten';

export default function KanzleiCockpit() {
  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="border-b bg-card px-6 py-6">
        <div className="max-w-[1720px]">
          <h1 className="text-2xl font-semibold text-foreground">Mandanten-Übersicht</h1>
          <p className="text-muted-foreground mt-1">
            Deine Mandanten auf einem Blick.
          </p>
        </div>
      </div>

      <div className="max-w-[1720px] p-6">
        
        <div className="bg-card rounded-lg border">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Mandant</th>
                <th>Monat</th>
                <th>Sicher</th>
                <th>Unsicher</th>
                <th>Fehlend</th>
                <th>Risk</th>
                <th>Aktivität</th>
              </tr>
            </thead>
            <tbody>
              {mockMandanten.map(m => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/kanzlei/mandant/${m.id}`} className="font-medium text-primary hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td>{m.month}</td>
                  <td><Badge className="badge-confident">{m.matchedConfident}</Badge></td>
                  <td><Badge className="badge-uncertain">{m.matchedUncertain}</Badge></td>
                  <td><Badge className="badge-missing">{m.missingReceipt}</Badge></td>
                  <td>{m.hasRiskFlag && <AlertTriangle className="h-4 w-4 text-warning" />}</td>
                  <td className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {m.lastActivity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
