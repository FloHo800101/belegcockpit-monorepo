// Azure Bank Statement Mapper – mapAzureBankStatementToParseResult

import { AzureParseResult, ParsedDocument } from "../types.ts";
import { detectStatementDate, detectStatementPeriod } from "../document-type-detection.ts";
import {
  extractFirstLineValue,
  extractIban,
  extractBic,
  extractCurrency,
  extractBalance,
  extractBalanceByPatterns,
  normalizeOcrText,
} from "./parse-utils.ts";
import { AzureAnalyzeResult } from "./azure-field-helpers.ts";
import { inferStatementFxHint } from "./bank-statement-fx.ts";
import {
  extractTransactions,
  extractTransactionsFromItems,
  extractTransactionsFromStatementLines,
  mergeBankStatementTransactions,
} from "./bank-statement-transactions.ts";

function extractBankStatementMetadata(content: string): {
  bankName: string | null;
  accountHolder: string | null;
} {
  const lines = content.split(/\r?\n/).map((l) => normalizeOcrText(l)).filter(Boolean);

  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const line = lines[i];
    // Tabular layout: labels like "Kontoinhaber", "BIC", "IBAN" on one line
    // Values on the next line(s) in matching column positions
    if (/\bKontoinhaber\b/i.test(line)) {
      // Check if multiple labels on same line (tabular header row)
      const hasMultipleLabels =
        /\bBIC\b/i.test(line) || /\bIBAN\b/i.test(line);

      if (hasMultipleLabels && i + 1 < lines.length) {
        // Tabular: next line has the values
        const valueLine = lines[i + 1];
        const parts = valueLine.split(/\s{2,}/);
        return {
          bankName: null, // Bank name not reliably in this layout
          accountHolder: parts[0]?.trim() || null,
        };
      }

      // Single label per line: "Kontoinhaber" then name on next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // Skip if next line is another label
        if (!/^(BIC|IBAN|Bank)\b/i.test(nextLine)) {
          return {
            bankName: null,
            accountHolder: nextLine || null,
          };
        }
      }

      // Inline: "Kontoinhaber: Josef Kleber"
      const inline = line.replace(/.*Kontoinhaber\s*[:\-]?\s*/i, "").trim();
      if (inline && !/^(BIC|IBAN)\b/i.test(inline)) {
        return { bankName: null, accountHolder: inline };
      }
    }
  }

  // Fallback
  return {
    bankName: extractFirstLineValue(content, "Bank") ?? null,
    accountHolder:
      extractFirstLineValue(content, "Kontoinhaber") ??
      extractFirstLineValue(content, "Account Holder") ??
      null,
  };
}

function resolveReferenceYear(
  statementPeriod: { from: string; to: string } | null,
  statementDate: string | null
): number {
  if (statementPeriod?.to) {
    const year = Number(statementPeriod.to.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  if (statementDate) {
    const year = Number(statementDate.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  return new Date().getUTCFullYear();
}

export function mapAzureBankStatementToParseResult(
  azureResult: unknown,
  fileName?: string | null
): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const content = (result?.content ?? "").toString();
  const statementDate = detectStatementDate(content);
  const statementPeriod = detectStatementPeriod(content);
  const referenceYear = resolveReferenceYear(statementPeriod, statementDate);
  const currency = extractCurrency(content) ?? "EUR";
  const statementFxHint = inferStatementFxHint(content, currency);
  const items = result.documents?.[0]?.fields?.Items?.valueArray ?? [];
  const parsedFromItems = extractTransactionsFromItems(
    content,
    items,
    currency,
    referenceYear,
    statementFxHint
  );
  const parsedFromLines = extractTransactionsFromStatementLines(
    content,
    currency,
    referenceYear,
    statementFxHint
  );
  const parsedFromLegacy = extractTransactions(content, currency, referenceYear, statementFxHint);
  const merged = mergeBankStatementTransactions(parsedFromItems, parsedFromLines);
  const transactions =
    merged.transactions.length > 0
      ? merged.transactions
      : parsedFromLegacy;
  const extractionPipeline =
    parsedFromItems.length > 0 && parsedFromLines.length > 0
      ? "hybrid_merge"
      : parsedFromItems.length > 0
      ? "items"
      : parsedFromLines.length > 0
      ? "statement_lines"
      : parsedFromLegacy.length > 0
      ? "legacy_lines"
      : "none";

  const openingBalance =
    extractBalance(content, "Alter Saldo") ??
    extractBalance(content, "Anfangssaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))/i,
    ]);
  const closingBalance =
    extractBalance(content, "Neuer Saldo") ??
    extractBalance(content, "Endsaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?![\s\S]*kontostand am)/i,
    ]);

  const iban = extractIban(content);
  const bic = extractBic(content);
  const hasStrongMetadata =
    Boolean(iban || bic) &&
    Boolean(statementPeriod || statementDate || openingBalance != null || closingBalance != null);
  const isLikelyBankStatement = transactions.length > 0 || hasStrongMetadata;
  const confidence = Math.min(
    0.95,
    0.4 +
      Math.min(0.35, transactions.length * 0.02) +
      (hasStrongMetadata ? 0.15 : 0) +
      (statementPeriod ? 0.05 : 0)
  );

  const metadata = extractBankStatementMetadata(content);

  const parsed: ParsedDocument = {
    sourceType: isLikelyBankStatement ? "bank_statement" : "unknown",
    documentType: isLikelyBankStatement ? "bank_statement" : "unknown",
    bankName: metadata.bankName,
    iban,
    bic,
    accountHolder: metadata.accountHolder,
    currency,
    statementDate,
    statementPeriod,
    openingBalance,
    closingBalance,
    transactions,
    source: {
      fileName: fileName ?? undefined,
      extractedBy: "azure",
    },
    rawMeta: {
      contentLength: content.length,
      extractionPipeline,
      itemsCount: parsedFromItems.length,
      lineCount: parsedFromLines.length,
      mergedCount: transactions.length,
      dedupMatchedCount: merged.dedupMatchedCount,
      qualityGatePassed: isLikelyBankStatement,
    },
  };

  return { parsed, confidence, rawResponse: azureResult };
}
