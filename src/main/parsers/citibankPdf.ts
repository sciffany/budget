import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";
import { runPythonParser } from "./runPythonParser";

export class CitibankPdfParser implements BankParser {
  readonly id = "citibankPdf";
  readonly displayName = "Citibank (PDF)";
  readonly formats: ("pdf" | "csv")[] = ["pdf"];

  detect(_filename: string, extractedText: string): number {
    // pdf-parse strips whitespace when extracting text from Citibank
    // eStatements, so match against a whitespace-free copy of the page.
    const compact = extractedText.replace(/\s+/g, "");
    return compact.includes("CITICASHBACKPLUSMASTERCARD") ? 1 : 0;
  }

  async parse(filepath: string): Promise<ParseResult> {
    const rows = await runPythonParser("citibank.py", filepath);
    const transactions: ParseResult["transactions"] = [];

    for (const row of rows) {
      if (!row.date || !row.amount) continue;

      // citibank.py emits ISO dates (yyyy-MM-dd) already stamped with the year
      // parsed from the PDF filename.
      const rawDate = parse(row.date, "yyyy-MM-dd", new Date());
      if (!isValid(rawDate)) continue;

      const amount = parseFloat(row.amount.replace(/,/g, ""));
      if (isNaN(amount) || amount === 0) continue;

      transactions.push({
        date: format(rawDate, "yyyy-MM-dd"),
        payee: row.desc.trim(),
        amount,
        rawLine: JSON.stringify(row),
      });
    }

    return {
      transactions,
      suggestedAccountName: "Citibank Credit Card",
    };
  }
}
