// ============================================
// BelegCockpit – Zentrale Utility für Verwendungszweck-Texte
// ============================================
// 
// REGEL (dokumentiert in UX_CONTRACT.md):
// - "Verwendungszweck" enthält IMMER realistische Bank-/Kartenumsatztexte
// - NIEMALS Status-/System-/UI-Texte wie "Beleg fehlt", "Wichtiger Posten"
// - Status-Informationen gehören in separate UI-Badges/Labels
//
// Diese Utility wird für alle Mock-/Seed-/Testdaten verwendet.

// Template-basierte Verwendungszweck-Generierung
const PURPOSE_TEMPLATES: Record<string, string[]> = {
  // Telekommunikation
  'Telekom Deutschland GmbH': [
    'SEPA-LASTSCHRIFT TELEKOM FESTNETZ RGN {ref}',
    'TELEKOM RECHNUNG {month} KD-NR {customer}',
    'DTAG MONATL. RECHNUNG {ref}',
  ],
  'Vodafone GmbH': [
    'SEPA-LASTSCHRIFT VODAFONE GMBH RGN {ref}',
    'VODAFONE MOBILFUNK {month} KD {customer}',
    'VODAFONE/KABEL DEUTSCHLAND {ref}',
  ],
  'MICROSOFT 365': [
    'MICROSOFT*M365 BUSINESS {ref}',
    'MSBILL.INFO OFFICE365 {ref}',
    'MICROSOFT*AZURE {month} SUB {ref}',
  ],
  
  // Software/Subscriptions
  'ADOBE *SUBSCRIPTION': [
    'ADOBE *CREATIVE CLOUD INV {ref}',
    'ADOBE SYSTEMS *ACROBAT PRO {ref}',
    'ADOBE.COM*PHOTOGRAPHY {month}',
  ],
  'GOOGLE *STORAGE': [
    'GOOGLE *CLOUD STORAGE {ref}',
    'GOOGLE *GSUITE BUSINESS {month}',
    'GOOGLE*SERVICES {ref}',
  ],
  
  // Parken/Transport
  'PARKAUTOMAT PINNEBERG': [
    'KARTENZAHLUNG PARKAUTOMAT PINNEBERG {date}',
    'EC PARKEN PINNEBERG ZW {time}',
    'EASYPARK*PINNEBERG {ref}',
  ],
  'PARKAUTOMAT HAMBURG': [
    'KARTENZAHLUNG PARKAUTOMAT HAMBURG {date}',
    'PARKRAUM HAMBURG {location} {time}',
    'APCOA*HAMBURG-CITY {ref}',
  ],
  'DB BAHN ONLINE-TICKET': [
    'DB VERTRIEB*ONLINE-TICKET {ref}',
    'DEUTSCHE BAHN BUCHUNG {ref}',
    'DB FERNVERKEHR AG TICKET {ref}',
  ],
  
  // Gastronomie
  'CAFE TRINKGELD': [
    'KARTENZAHLUNG CAFE {location} {date}',
    'EC {merchant} {date} {time}',
  ],
  'CAFE ALSTER': [
    'KARTENZAHLUNG CAFE ALSTER {date}',
    'EC CAFE ALSTER HAMBURG {date} {time}',
  ],
  'RESTAURANT BEWIRTUNG': [
    'KARTENZAHLUNG RESTAURANT {merchant} {date}',
    'EC GASTRONOMIE {location} {date}',
  ],
  'HOTEL HAMBURG': [
    'HOTEL HAMBURG GMBH RGN {ref}',
    'KARTENZAHLUNG HOTEL HAMBURG {date}',
    'EC HOTEL HAMBURG CITY {date}',
  ],
  
  // Retail/Einkauf
  'COPYSHOP PINNEBERG': [
    'KARTENZAHLUNG COPYSHOP PINNEBERG {date}',
    'EC COPY CENTER PINNEBERG {date}',
  ],
  'KIOSK BAHNHOF': [
    'KARTENZAHLUNG KIOSK BHF {location} {date}',
    'EC PRESS & BUCH {date}',
  ],
  'TRINKGELD RESTAURANT': [
    'KARTENZAHLUNG TRINKGELD {date}',
    'EC GASTRONOMIE TIP {date}',
  ],
  
  // Großeinkäufe
  'Dell GmbH': [
    'UEBERWEISUNG RE {ref} DELL GMBH',
    'DELL GERMANY GMBH RGN {ref}',
    'DELL*OUTLET RECHNUNG {ref}',
  ],
  'BAUHAUS': [
    'KARTENZAHLUNG BAUHAUS FIL {store} {date}',
    'EC BAUHAUS {location} {date}',
    'BAUHAUS FACHCENTRUM RE {ref}',
  ],
  'MEDIAMARKT': [
    'KARTENZAHLUNG MEDIAMARKT FIL {store} {date}',
    'EC MEDIAMARKT {location} {date}',
    'MEDIA MARKT TV-HIFI-ELEKTRO {ref}',
  ],
  'HORNBACH': [
    'KARTENZAHLUNG HORNBACH {store} {date}',
    'EC HORNBACH BAUMARKT {location} {date}',
    'HORNBACH BAUMARKT AG RE {ref}',
  ],
  'CONRAD': [
    'KARTENZAHLUNG CONRAD ELECTRONIC {date}',
    'CONRAD ELECTRONIC SE RE {ref}',
    'EC CONRAD FILIALE {store} {date}',
  ],
  
  // Marktplätze
  'AMAZON EU SARL': [
    'AMZ*{ref} AMAZON.DE',
    'AMAZON EU SARL BESTELLUNG {ref}',
    'AMAZON PAYMENTS {date} {ref}',
  ],
  'AMAZON MARKETPLACE': [
    'AMZ*MARKETPLACE {ref}',
    'AMAZON.DE MKTPLACE {ref}',
    'AMZN*{seller} {ref}',
  ],
  'EBAY SETTLEMENT': [
    'EBAY O*{ref} SETTLEMENT',
    'PAYPAL *EBAY GMBH AUSZAHLUNG',
    'EBAY COMMERCE SETTLEMENT {date}',
  ],
  'PAYPAL SETTLEMENT': [
    'PAYPAL AUSZAHLUNG {ref}',
    'PP SETTLEMENT {date} {ref}',
    'PAYPAL EUROPE SETTLEMENT',
  ],
  
  // PayPal
  'PAYPAL *SHOP-XYZ': [
    'PP*{ref} SHOP-XYZ DE',
    'PAYPAL *SHOP-XYZ {date}',
    'PP.6272.PP*SHOP-XYZ',
  ],
  
  // Versorger
  'STROMVERSORGER ABC': [
    'SEPA-LASTSCHRIFT STROMVERSORGER ABC RGN {ref}',
    'STROMVERSORGER ABC ABSCHLAG {month}',
    'ENERGIE ABC GMBH ABRECHNUNG {ref}',
  ],
  
  // Bankgebühren
  'BANKGEBUEHR KONTO': [
    'KONTOFÜHRUNGSGEBÜHR {month}',
    'ENTGELT KONTOFÜHRUNG {month}',
    'BUCHUNGSPOSTEN ENTGELT {month}',
  ],
  
  // Refunds / Gutschriften
  'ADOBE REFUND': [
    'GUTSCHRIFT ADOBE SYSTEMS {ref}',
    'ADOBE SYSTEMS REFUND {ref}',
    'STORNO ADOBE *CREATIVE {ref}',
  ],
  'AMAZON RETOURE': [
    'GUTSCHRIFT RETOURE AMZ*{ref}',
    'AMAZON EU REFUND {ref}',
    'AMAZON.DE ERSTATTUNG BEST {ref}',
  ],
  'ZALANDO RETOURE': [
    'GUTSCHRIFT ZALANDO SE {ref}',
    'ZALANDO ERSTATTUNG RE {ref}',
    'ZALANDO RETOURE BEST {ref}',
  ],
  'PAYPAL ERSTATTUNG': [
    'PAYPAL ERSTATTUNG {ref}',
    'PP REFUND *MERCHANT {ref}',
    'PAYPAL RÜCKZAHLUNG {ref}',
  ],
  'MEDIAMARKT GUTSCHRIFT': [
    'GUTSCHRIFT MEDIAMARKT FIL {store}',
    'MEDIA MARKT ERSTATTUNG RE {ref}',
    'MEDIAMARKT RETOURE {date}',
  ],
  'OTTO RETOURE': [
    'OTTO GMBH GUTSCHRIFT {ref}',
    'OTTO ERSTATTUNG BEST {ref}',
    'OTTO RETOURE RÜCKZAHLUNG {ref}',
  ],
  'DB BAHN ERSTATTUNG': [
    'DB VERTRIEB ERSTATTUNG {ref}',
    'DEUTSCHE BAHN REFUND TICKET {ref}',
    'DB FAHRPREIS ERSTATTUNG {ref}',
  ],
  
  // Settlement/Payment Provider
  'PAYMENT PROVIDER SETTLEMENT': [
    'STRIPE PAYOUT {date} {ref}',
    'MOLLIE PAYMENTS AUSZAHLUNG {ref}',
    'SUMUP *SETTLEMENT {date}',
  ],
};

// Fallback-Templates für unbekannte Merchants
const FALLBACK_TEMPLATES = {
  Card: [
    'KARTENZAHLUNG {merchant} {date}',
    'EC {merchant} {date} {time}',
    'VISA {merchant} {date}',
  ],
  Bank: [
    'UEBERWEISUNG {merchant} RE {ref}',
    'SEPA-LASTSCHRIFT {merchant} {ref}',
    'DAUERAUFTRAG {merchant}',
  ],
  PayPal: [
    'PAYPAL *{merchant} {ref}',
    'PP*{ref} {merchant}',
    'PP.{ref}.PP*{merchant}',
  ],
};

// Generatoren für Platzhalter
function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

function generateCustomer(): string {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

function generateStore(): string {
  return String(Math.floor(100 + Math.random() * 9900)).padStart(4, '0');
}

function getMonth(dateStr: string): string {
  const months = ['JAN', 'FEB', 'MRZ', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
  const date = new Date(dateStr);
  return months[date.getMonth()];
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

function generateTime(): string {
  const hour = Math.floor(8 + Math.random() * 12);
  const minute = Math.floor(Math.random() * 60);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

const LOCATIONS = ['HAMBURG', 'BERLIN', 'MÜNCHEN', 'KÖLN', 'FRANKFURT', 'PINNEBERG', 'ALTONA'];
const SELLERS = ['TECHNIK24', 'HOMEWARE', 'OFFICEXP', 'GADGETS', 'TOOLBOX'];

function replacePlaceholders(template: string, merchant: string, date: string): string {
  return template
    .replace('{merchant}', merchant.toUpperCase())
    .replace('{ref}', generateRef())
    .replace('{customer}', generateCustomer())
    .replace('{store}', generateStore())
    .replace('{month}', getMonth(date))
    .replace('{date}', formatDateShort(date))
    .replace('{time}', generateTime())
    .replace('{location}', LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)])
    .replace('{seller}', SELLERS[Math.floor(Math.random() * SELLERS.length)]);
}

/**
 * Generiert einen realistischen Bank-/Kartenumsatztext (Verwendungszweck)
 * für eine gegebene Transaktion.
 * 
 * @param merchant - Name des Händlers/Empfängers
 * @param paymentMethod - Zahlungsart (Bank, Card, PayPal)
 * @param date - Transaktionsdatum (YYYY-MM-DD)
 * @returns Realistischer Verwendungszweck-Text
 */
export function generateTransactionPurpose(
  merchant: string, 
  paymentMethod: string = 'Card',
  date: string = '2026-01-15'
): string {
  // Suche nach spezifischen Templates für diesen Merchant
  const templates = PURPOSE_TEMPLATES[merchant];
  
  if (templates && templates.length > 0) {
    const template = templates[Math.floor(Math.random() * templates.length)];
    return replacePlaceholders(template, merchant, date);
  }
  
  // Fallback auf Payment-Method-basierte Templates
  const fallbackTemplates = FALLBACK_TEMPLATES[paymentMethod as keyof typeof FALLBACK_TEMPLATES] 
    || FALLBACK_TEMPLATES.Card;
  const template = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
  return replacePlaceholders(template, merchant, date);
}

/**
 * Generiert einen deterministischen Verwendungszweck basierend auf Transaction-ID
 * (für konsistente Mock-Daten über Re-Renders hinweg)
 */
export function generateDeterministicPurpose(
  transactionId: string,
  merchant: string,
  paymentMethod: string,
  date: string
): string {
  // Einfacher Hash aus der Transaction-ID für Determinismus
  const hash = transactionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const templates = PURPOSE_TEMPLATES[merchant];
  
  if (templates && templates.length > 0) {
    const template = templates[hash % templates.length];
    // Für Determinismus: feste Platzhalter basierend auf Hash
    return template
      .replace('{merchant}', merchant.toUpperCase())
      .replace('{ref}', `REF${(hash % 99999999).toString().padStart(8, '0')}`)
      .replace('{customer}', (hash * 7 % 999999999).toString())
      .replace('{store}', (hash % 9999).toString().padStart(4, '0'))
      .replace('{month}', getMonth(date))
      .replace('{date}', formatDateShort(date))
      .replace('{time}', `${(hash % 12 + 8).toString().padStart(2, '0')}:${(hash % 60).toString().padStart(2, '0')}`)
      .replace('{location}', LOCATIONS[hash % LOCATIONS.length])
      .replace('{seller}', SELLERS[hash % SELLERS.length]);
  }
  
  // Fallback
  const fallbackTemplates = FALLBACK_TEMPLATES[paymentMethod as keyof typeof FALLBACK_TEMPLATES] || FALLBACK_TEMPLATES.Card;
  const template = fallbackTemplates[hash % fallbackTemplates.length];
  return template
    .replace('{merchant}', merchant.toUpperCase())
    .replace('{ref}', `REF${(hash % 99999999).toString().padStart(8, '0')}`)
    .replace('{date}', formatDateShort(date))
    .replace('{time}', `${(hash % 12 + 8).toString().padStart(2, '0')}:${(hash % 60).toString().padStart(2, '0')}`);
}
