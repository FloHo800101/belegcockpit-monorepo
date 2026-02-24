// Azure Layout Mapper – mapAzureLayoutToParseResult

import { AzureParseResult, ParsedDocument } from "../types.ts";
import { AzureAnalyzeResult } from "./azure-field-helpers.ts";

export function mapAzureLayoutToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const keyValuePairs = result.keyValuePairs || [];
  const tables = result.tables || [];

  const parsed: ParsedDocument = {
    sourceType: "layout",
    documentType: "unknown",
    rawMeta: { keyValuePairs, tables },
  };

  return { parsed, confidence: 0.5, rawResponse: azureResult };
}
