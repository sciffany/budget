import { readFileSync } from "fs";
import { format, isValid, parse } from "date-fns";
import type { ParseResult } from "@shared/types";
import type { BankParser } from "./registry";

export class UOBCreditParser implements BankParser {
  readonly id = "uobCredit";
  readonly displayName = "UOB Credit Card";
  readonly formats = ["pdf"] as const;

  detect(filename: string, extractedText: string): number {
    const fileScore = /uob/i.test(filename) ? 0.4 : 0;
    const textScore =
      /United Overseas Bank/i.test(extractedText) ||
      /UOB VISA|UOB ONE/i.test(extractedText)
        ? 0.6
        : 0;
    return Math.min(fileScore + textScore, 1);
  }

  async parse(filepath: string): Promise<ParseResult> {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = readFileSync(filepath);
    const result = await pdfParse(buffer);
    const text = result.text;

    const transactions: ParseResult["transactions"] = [];

    // UOB credit card statement pattern: DD MMM YYYY  Description  Amount
    // e.g. "15 Jan 2024  GRAB*FOOD SG  12.50"
    const lineRe =
      /^(\d{2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?$/gm;

    let match: RegExpExecArray | null;
    while ((match = lineRe.exec(text)) !== null) {
      const [, dateStr, payee, amountStr, cr] = match;
      const rawDate = parse(dateStr, "dd MMM yyyy", new Date());
      if (!isValid(rawDate)) continue;
      const amount = parseFloat(amountStr.replace(",", ""));
      // Credit = positive, debit = negative
      const signed = cr ? amount : -amount;

      transactions.push({
        date: format(rawDate, "yyyy-MM-dd"),
        payee: payee.trim(),
        amount: signed,
        rawLine: match[0],
      });
    }

    return {
      transactions,
      suggestedAccountName: "UOB Credit",
    };
  }
}
