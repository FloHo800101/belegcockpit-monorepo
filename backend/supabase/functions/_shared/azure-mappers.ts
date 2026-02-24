// Fassade: Re-exportiert alle Azure-Mapper-Funktionen aus den aufgeteilten Modulen.
// Bestehende Imports aus dieser Datei bleiben stabil.

export { mapAzureInvoiceToParseResult } from "./azure-mappers/invoice-mapper.ts";
export { mapAzureReceiptToParseResult } from "./azure-mappers/receipt-mapper.ts";
export { mapAzureLayoutToParseResult } from "./azure-mappers/layout-mapper.ts";
export { mapAzureBankStatementToParseResult } from "./azure-mappers/bank-statement-mapper.ts";
