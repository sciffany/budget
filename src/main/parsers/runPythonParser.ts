import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { parse as parseCsv } from "papaparse";
import { app } from "electron";

export interface PythonCsvRow {
  date: string;
  desc: string;
  amount: string;
}

function resolveScriptPath(scriptName: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "python", scriptName);
  }
  return join(app.getAppPath(), "src/main/parsers", scriptName);
}

export function runPythonParser(
  scriptName: string,
  pdfPath: string
): Promise<PythonCsvRow[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveScriptPath(scriptName);
    const csvPath = join(tmpdir(), `budget-${randomUUID()}.csv`);

    const proc = spawn("python3", [scriptPath, pdfPath, csvPath]);

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Python parser "${scriptName}" exited ${code}: ${stderr}`)
        );
      }
      try {
        const content = readFileSync(csvPath, "utf-8");
        const { data, errors } = parseCsv<PythonCsvRow>(content, {
          header: true,
          skipEmptyLines: true,
        });
        if (errors.length) {
          return reject(new Error(`CSV parse error: ${errors[0].message}`));
        }
        try {
          unlinkSync(csvPath);
        } catch {
          // temp file cleanup is best-effort
        }
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to spawn python3 — is Python 3 installed? (${err.message})`
        )
      );
    });
  });
}
