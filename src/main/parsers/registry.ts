import { readFileSync } from "fs";
import { extname } from "path";
import type { ParseResult } from "@shared/types";

export interface BankParser {
  readonly id: string;
  readonly displayName: string;
  readonly formats: ("pdf" | "csv")[];
  detect(filename: string, extractedText: string): number;
  parse(filepath: string): Promise<ParseResult>;
}

class ParserRegistry {
  private parsers: BankParser[] = [];

  register(parser: BankParser): void {
    this.parsers.push(parser);
  }

  get(id: string): BankParser {
    const parser = this.parsers.find((p) => p.id === id);
    if (!parser) throw new Error(`No parser registered with id "${id}"`);
    return parser;
  }

  async detect(filepath: string): Promise<BankParser> {
    const filename = filepath.split("/").pop() ?? filepath;
    const ext = extname(filename).toLowerCase().slice(1);

    let extractedText = "";
    if (ext === "csv") {
      extractedText = readFileSync(filepath, "utf-8").slice(0, 4096);
    } else if (ext === "pdf") {
      // Lazy import to avoid loading pdf-parse at startup
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = readFileSync(filepath);
      const result = await pdfParse(buffer, { max: 1 });
      extractedText = result.text.slice(0, 4096);
    }

    let bestParser: BankParser | null = null;
    let bestScore = 0;

    for (const parser of this.parsers) {
      const score = parser.detect(filename, extractedText);
      if (score > bestScore) {
        bestScore = score;
        bestParser = parser;
      }
    }

    if (!bestParser || bestScore <= 0.5) {
      throw new Error(
        `Could not detect bank parser for "${filename}" (best score: ${bestScore.toFixed(2)})`
      );
    }

    return bestParser;
  }

  list(): BankParser[] {
    return [...this.parsers];
  }
}

export const parserRegistry = new ParserRegistry();
