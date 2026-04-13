import { readFileSync } from "fs";
import { parse as parseCsv } from "papaparse";
import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";

interface PayLahCsvRow {
  Date: string;
  Description: string;
  "Transaction Type": string;
  Amount: string;
}

export class PayLahParser implements BankParser {
  readonly id = "paylah";
  readonly displayName = "DBS PayLah!";
  readonly formats = ["csv"] as const;

  detect(filename: string, extractedText: string): number {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "csv" && !/paylah/i.test(filename)) return 0;
    const fileScore = /paylah/i.test(filename) ? 0.6 : 0;
    const textScore =
      /PayLah/i.test(extractedText) || /DBS PayLah/i.test(extractedText)
        ? 0.5
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const content = readFileSync(filepath, "utf-8");
    const { data } = parseCsv<PayLahCsvRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const transactions: ParseResult["transactions"] = [];

    for (const row of data) {
      if (!row.Date || !row.Amount) continue;

      const rawDate = parse(row.Date, "dd/MM/yyyy", new Date());
      if (!isValid(rawDate)) continue;

      const amount = parseFloat(row.Amount.replace(/[^0-9.-]/g, ""));
      if (isNaN(amount)) continue;

      // PayLah exports typically show debits as negative in the Amount column
      transactions.push({
        date: format(rawDate, "yyyy-MM-dd"),
        payee: row.Description?.trim() ?? "",
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
