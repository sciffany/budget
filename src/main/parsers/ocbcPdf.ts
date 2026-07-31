import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";
import { runPythonParser } from "./runPythonParser";

export class OCBCPdfParser implements BankParser {
  readonly id = "ocbcPdf";
  readonly displayName = "OCBC Bank (PDF)";
  readonly formats: ("pdf" | "csv")[] = ["pdf"];

  detect(_filename: string, extractedText: string): number {
    return extractedText.includes("Oversea-Chinese Banking Corporation Limited")
      ? 1
      : 0;
  }

  async parse(filepath: string): Promise<ParseResult> {
    const rows = await runPythonParser("ocbc.py", filepath);
    const transactions: ParseResult["transactions"] = [];

    for (const row of rows) {
      if (!row.date || !row.amount) continue;

      // ocbc.py emits ISO dates (yyyy-MM-dd)
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
      suggestedAccountName: "OCBC 360",
    };
  }
}
