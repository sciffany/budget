import { readFileSync } from "fs";
import { parse as parseCsv } from "papaparse";
import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";

// OCBC bank account statement CSV:
// Date,Description,Withdrawals (SGD),Deposits (SGD),Daily Balance (SGD)
// 01/01/2024,GIRO PAYMENT,100.00,,900.00
interface OcbcCsvRow {
  Date: string;
  Description: string;
  "Withdrawals (SGD)": string;
  "Deposits (SGD)": string;
  "Daily Balance (SGD)": string;
}

export class OCBCDebitParser implements BankParser {
  readonly id = "ocbcDebit";
  readonly displayName = "OCBC Bank (Debit/Current)";
  readonly formats: ("pdf" | "csv")[] = ["csv"];

  detect(filename: string, extractedText: string): number {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "csv" && !/ocbc/i.test(filename)) return 0;
    const fileScore = /ocbc/i.test(filename) ? 0.5 : 0;
    const textScore =
      /OCBC Bank|Oversea-Chinese Banking/i.test(extractedText) ||
      /Withdrawals \(SGD\)|Deposits \(SGD\)/i.test(extractedText)
        ? 0.6
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const raw = readFileSync(filepath, "utf-8");

    // OCBC CSVs may include account metadata rows before the column header;
    // skip until we find the header row.
    const lines = raw.split("\n");
    const headerIdx = lines.findIndex((l) => /^Date[,\t]/i.test(l));
    const content =
      headerIdx >= 0 ? lines.slice(headerIdx).join("\n") : raw;

    const { data } = parseCsv<OcbcCsvRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const transactions: ParseResult["transactions"] = [];

    for (const row of data) {
      const dateStr = row["Date"]?.trim();
      if (!dateStr) continue;

      // e.g. "01/01/2024"
      const rawDate = parse(dateStr, "dd/MM/yyyy", new Date());
      if (!isValid(rawDate)) continue;

      const withdrawal = parseFloat(
        (row["Withdrawals (SGD)"] ?? "").replace(/[^0-9.]/g, "")
      );
      const deposit = parseFloat(
        (row["Deposits (SGD)"] ?? "").replace(/[^0-9.]/g, "")
      );

      const hasWithdrawal = !isNaN(withdrawal) && withdrawal > 0;
      const hasDeposit = !isNaN(deposit) && deposit > 0;
      if (!hasWithdrawal && !hasDeposit) continue;

      // Withdrawals are outflows (negative), deposits are inflows (positive)
      const amount = hasWithdrawal ? -withdrawal : deposit;

      transactions.push({
        date: format(rawDate, "yyyy-MM-dd"),
        payee: row.Description?.trim() ?? "",
        amount,
        rawLine: JSON.stringify(row),
      });
    }

    return {
      transactions,
      suggestedAccountName: "OCBC Debit",
    };
  }
}
