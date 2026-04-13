import { readFileSync } from "fs";
import { parse as parseCsv } from "papaparse";
import { format, isValid, parseISO } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";

// Revolut CSV statement:
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// CARD_PAYMENT,Current,2024-01-01 12:00:00,2024-01-01 12:00:01,Grab,-10.00,0.00,SGD,COMPLETED,990.00
interface RevolutCsvRow {
  Type: string;
  Product: string;
  "Started Date": string;
  "Completed Date": string;
  Description: string;
  Amount: string;
  Fee: string;
  Currency: string;
  State: string;
  Balance: string;
}

export class RevolutWalletParser implements BankParser {
  readonly id = "revolutWallet";
  readonly displayName = "Revolut Wallet";
  readonly formats: ("pdf" | "csv")[] = ["csv"];

  detect(filename: string, extractedText: string): number {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "csv" && !/revolut/i.test(filename)) return 0;
    const fileScore = /revolut/i.test(filename) ? 0.6 : 0;
    const textScore =
      /Revolut/i.test(extractedText) ||
      /Started Date.*Completed Date.*Description.*Amount.*Fee.*Currency.*State/i.test(
        extractedText
      )
        ? 0.5
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const content = readFileSync(filepath, "utf-8");
    const { data } = parseCsv<RevolutCsvRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const transactions: ParseResult["transactions"] = [];

    for (const row of data) {
      // Only include completed transactions
      if (row.State?.trim().toUpperCase() !== "COMPLETED") continue;

      const dateStr = (row["Completed Date"] ?? row["Started Date"])?.trim();
      if (!dateStr) continue;

      // Revolut uses ISO-like format: "2024-01-01 12:00:00"
      const rawDate = parseISO(dateStr.replace(" ", "T"));
      if (!isValid(rawDate)) continue;

      const amount = parseFloat(
        (row.Amount ?? "").replace(/[^0-9.-]/g, "")
      );
      if (isNaN(amount)) continue;

      // Revolut already signs the amount: negative = debit, positive = credit
      transactions.push({
        date: format(rawDate, "yyyy-MM-dd"),
        payee: row.Description?.trim() ?? "",
        amount,
        rawLine: JSON.stringify(row),
      });
    }

    return {
      transactions,
      suggestedAccountName: "Revolut Wallet",
    };
  }
}
