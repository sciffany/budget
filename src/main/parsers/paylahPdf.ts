import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";
import { runPythonParser } from "./runPythonParser";

export class PayLahPdfParser implements BankParser {
  readonly id = "paylahPdf";
  readonly displayName = "DBS PayLah! (PDF)";
  readonly formats: ("pdf" | "csv")[] = ["pdf"];

  detect(filename: string, extractedText: string): number {
    const fileScore = /paylah/i.test(filename) ? 0.6 : 0;
    const textScore =
      /PayLah/i.test(extractedText) || /DBS PayLah/i.test(extractedText)
        ? 0.5
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const rows = await runPythonParser("paylah.py", filepath);
    const transactions: ParseResult["transactions"] = [];

    for (const row of rows) {
      if (!row.date || !row.amount) continue;

      // paylah.py outputs dates as "DD MMM YYYY" (e.g. "15 Jan 2024")
      const rawDate = parse(row.date, "dd MMM yyyy", new Date());
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
      suggestedAccountName: "DBS PayLah!",
    };
  }
}
