import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";
import { runPythonParser } from "./runPythonParser";

export class DBSDebitParser implements BankParser {
  readonly id = "dbsDebit";
  readonly displayName = "DBS Bank (Debit/Current)";
  readonly formats: ("pdf" | "csv")[] = ["pdf"];

  detect(filename: string, extractedText: string): number {
    if (extractedText.includes("52880148A")) return 1;
    const fileScore = /dbs/i.test(filename) ? 0.4 : 0;
    const textScore =
      /DBS Bank|Development Bank of Singapore/i.test(extractedText) ||
      /Transaction Date.*Reference.*Debit Amount/i.test(extractedText)
        ? 0.6
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const rows = await runPythonParser("dbs.py", filepath);
    const transactions: ParseResult["transactions"] = [];

    for (const row of rows) {
      if (!row.date || !row.amount) continue;

      // dbs.py outputs dates as DD/MM/YYYY
      const rawDate = parse(row.date, "dd/MM/yyyy", new Date());
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
      suggestedAccountName: "DBS Debit",
    };
  }
}
