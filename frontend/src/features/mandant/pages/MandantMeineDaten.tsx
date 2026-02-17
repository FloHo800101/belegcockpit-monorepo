import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save } from 'lucide-react';

// Mock Mandant data
const initialData = {
  firma: 'Mustermann GmbH',
  name: 'Max Mustermann',
  strasse: 'Musterstraße 123',
  plz: '12345',
  ort: 'Musterstadt',
  steuerId: '12/345/67890',
  ustId: 'DE123456789',
  finanzamt: 'Finanzamt Musterstadt',
  email: 'max@mustermann-gmbh.de',
  telefon: '+49 123 456789',
};

export default function MandantMeineDaten() {
  const [data, setData] = useState(initialData);
  const { toast } = useToast();

  const handleChange = (field: keyof typeof data, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    toast({
      title: 'Daten gespeichert',
      description: 'Ihre Stammdaten wurden erfolgreich aktualisiert.',
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Meine Daten</h1>
        <p className="text-muted-foreground">
          Hier können Sie Ihre Stammdaten einsehen und bearbeiten.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Firmendaten</CardTitle>
          <CardDescription>Grundlegende Informationen zu Ihrem Unternehmen</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firma">Firma</Label>
              <Input
                id="firma"
                value={data.firma}
                onChange={(e) => handleChange('firma', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Ansprechpartner</Label>
              <Input
                id="name"
                value={data.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse</CardTitle>
          <CardDescription>Geschäftsadresse des Unternehmens</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="strasse">Straße und Hausnummer</Label>
            <Input
              id="strasse"
              value={data.strasse}
              onChange={(e) => handleChange('strasse', e.target.value)}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plz">PLZ</Label>
              <Input
                id="plz"
                value={data.plz}
                onChange={(e) => handleChange('plz', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ort">Ort</Label>
              <Input
                id="ort"
                value={data.ort}
                onChange={(e) => handleChange('ort', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steuerliche Angaben</CardTitle>
          <CardDescription>Steuernummern und zuständiges Finanzamt</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="steuerId">Steuer-ID</Label>
              <Input
                id="steuerId"
                value={data.steuerId}
                onChange={(e) => handleChange('steuerId', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ustId">USt-ID</Label>
              <Input
                id="ustId"
                value={data.ustId}
                onChange={(e) => handleChange('ustId', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finanzamt">Finanzamt</Label>
            <Input
              id="finanzamt"
              value={data.finanzamt}
              onChange={(e) => handleChange('finanzamt', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontaktdaten</CardTitle>
          <CardDescription>E-Mail und Telefon</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefon">Telefon</Label>
              <Input
                id="telefon"
                value={data.telefon}
                onChange={(e) => handleChange('telefon', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> Änderungen speichern
        </Button>
      </div>
    </div>
  );
}
