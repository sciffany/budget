import { readFileSync } from "fs";
import { parse as parseCsv } from "papaparse";
import { format, isValid, parse, parseISO } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";

// Candidate column name patterns, ordered by preference
const DATE_PATTERNS = [
  /^date$/i,
  /^transaction.?date$/i,
  /^posted.?date$/i,
  /^value.?date$/i,
  /^started.?date$/i,
  /^completed.?date$/i,
  /date/i,
];

const DESCRIPTION_PATTERNS = [
  /^description$/i,
  /^details$/i,
  /^narrative$/i,
  /^memo$/i,
  /^payee$/i,
  /^reference$/i,
  /^particulars$/i,
  /description|details|narrative|memo/i,
];

const AMOUNT_PATTERNS = [
  /^amount$/i,
  /^transaction.?amount$/i,
  /^debit.?credit$/i,
  /^net.?amount$/i,
  /amount/i,
];

// Separate debit/credit column pairs
const DEBIT_PATTERNS = [/^(debit|withdrawal|withdrawals?|dr)(\s*\(.*\))?$/i, /debit|withdrawal/i];
const CREDIT_PATTERNS = [/^(credit|deposit|deposits?|cr)(\s*\(.*\))?$/i, /credit|deposit/i];

const DATE_FORMATS = [
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy-MM-dd",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "dd MMM yyyy",
  "MMM dd, yyyy",
  "d/M/yyyy",
  "M/d/yyyy",
];

function pickColumn(headers: string[], patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = headers.find((h) => pattern.test(h.trim()));
    if (match) return match;
  }
  return undefined;
}

function parseAmount(raw: string): number | null {
  if (!raw?.trim()) return null;
  // Strip currency symbols, commas, spaces; keep digits, dots, minus, parens
  const cleaned = raw.replace(/[^0-9.()\-]/g, "");
  // Parentheses = negative (accounting format)
  if (/^\(.*\)$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/[()]/g, ""));
    return isNaN(n) ? null : -n;
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseDate(raw: string): Date | null {
  if (!raw?.trim()) return null;
  // Try ISO first
  const iso = parseISO(raw.trim().replace(" ", "T"));
  if (isValid(iso)) return iso;
  // Try known formats
  for (const fmt of DATE_FORMATS) {
    const d = parse(raw.trim(), fmt, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

export class GenericCsvParser implements BankParser {
  readonly id = "genericCsv";
  readonly displayName = "Generic CSV";
  readonly formats: ("pdf" | "csv")[] = ["csv"];

  detect(filename: string, _extractedText: string): number {
    const ext = filename.split(".").pop()?.toLowerCase();
    // Low-confidence fallback: accepted for any CSV but below specific parsers
    return ext === "csv" ? 0.55 : 0;
  }

  async parse(filepath: string): Promise<ParseResult> {
    const raw = readFileSync(filepath, "utf-8");

    // Skip metadata rows before the header (look for the first row that has
    // multiple comma/tab-separated fields with a recognisable column name)
    const lines = raw.split("\n");
    const headerIdx = lines.findIndex((line) => {
      const fields = line.split(/,|\t/).map((f) => f.trim());
      return (
        fields.length >= 2 &&
        fields.some(
          (f) =>
            /date|amount|debit|credit|description|details|narrative/i.test(f)
        )
      );
    });
    const content = headerIdx >= 0 ? lines.slice(headerIdx).join("\n") : raw;

    const { data, meta } = parseCsv<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const headers: string[] = meta.fields ?? [];

    const dateCol = pickColumn(headers, DATE_PATTERNS);
    const descCol = pickColumn(headers, DESCRIPTION_PATTERNS);
    const amountCol = pickColumn(headers, AMOUNT_PATTERNS);
    const debitCol = pickColumn(headers, DEBIT_PATTERNS);
    const creditCol = pickColumn(headers, CREDIT_PATTERNS);

    if (!dateCol) {
      throw new Error("Generic CSV parser: could not identify a date column");
    }
    if (!amountCol && (!debitCol || !creditCol)) {
      throw new Error(
        "Generic CSV parser: could not identify amount column(s)"
      );
    }

    const transactions: ParseResult["transactions"] = [];

    for (const row of data) {
      const rawDate = row[dateCol]?.trim();
      const parsed = rawDate ? parseDate(rawDate) : null;
      if (!parsed) continue;

      let amount: number | null = null;

      if (amountCol) {
        amount = parseAmount(row[amountCol] ?? "");
      } else if (debitCol && creditCol) {
        const debit = parseAmount(row[debitCol] ?? "");
        const credit = parseAmount(row[creditCol] ?? "");
        if (debit != null && debit !== 0) {
          amount = -Math.abs(debit);
        } else if (credit != null && credit !== 0) {
          amount = Math.abs(credit);
        }
      }

      if (amount == null || amount === 0) continue;

      const payee = descCol ? (row[descCol]?.trim() ?? "") : "";

      transactions.push({
        date: format(parsed, "yyyy-MM-dd"),
        payee,
        amount,
        rawLine: JSON.stringify(row),
      });
    }

    return {
      transactions,
      suggestedAccountName: "Imported Account",
    };
  }
}
