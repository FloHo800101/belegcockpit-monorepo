// Azure Document Intelligence Feld-Typen und Zugriffsfunktionen

import { ParsedAddress } from "../types.ts";
import { parseDateFlexible } from "./parse-utils.ts";

export type AzureAddress = {
  streetAddress?: string;
  road?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  countryRegion?: string;
  country?: string;
};

export type AzureValueCurrency = {
  amount?: number;
  currencyCode?: string;
};

export type AzureField = {
  valueString?: string;
  content?: string;
  valueNumber?: number;
  valueCurrency?: AzureValueCurrency;
  valueDate?: string;
  valueArray?: Array<{ valueObject?: Record<string, AzureField> }>;
  valueObject?: Record<string, AzureField>;
  valueAddress?: AzureAddress;
};

export type AzureDocument = {
  fields?: Record<string, AzureField>;
  confidence?: number;
};

export type AzureAnalyzeResult = {
  documents?: AzureDocument[];
  content?: string;
  keyValuePairs?: unknown[];
  tables?: unknown[];
};

export function toParsedAddress(address?: AzureAddress | null): ParsedAddress | null {
  if (!address) return null;
  const street =
    address.streetAddress ||
    [address.road, address.houseNumber].filter(Boolean).join(" ") ||
    null;
  return {
    street: street || null,
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    country: address.countryRegion ?? address.country ?? "DE",
  };
}

export function getValue(field?: AzureField | null): string | null {
  return field?.valueString || field?.content || null;
}

export function getNumber(field?: AzureField | null): number | null {
  return field?.valueNumber ?? field?.valueCurrency?.amount ?? null;
}

export function getDate(field?: AzureField | null): string | null {
  return field?.valueDate || null;
}

export function extractDateFromField(field?: AzureField | null): string | null {
  if (field?.valueDate) return field.valueDate;
  return parseDateFlexible(field?.valueString || field?.content || null);
}

export function resolvePreferredDate(field?: AzureField | null): string | null {
  const textDate = parseDateFlexible(field?.valueString || field?.content || null);
  if (!field?.valueDate) return textDate;

  if (!textDate) return field.valueDate;

  const valueDate = parseDateFlexible(field.valueDate) ?? field.valueDate;
  const valueMs = Date.parse(valueDate);
  const textMs = Date.parse(textDate);
  const bothValid = Number.isFinite(valueMs) && Number.isFinite(textMs);
  const differsStrongly = bothValid ? Math.abs(valueMs - textMs) > 31 * 86400000 : false;

  if (differsStrongly) return textDate;
  return field.valueDate;
}
