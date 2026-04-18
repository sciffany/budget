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

interface ParserCommand {
  cmd: string;
  args: string[];
}

function resolveCommand(scriptName: string): ParserCommand {
  // In a packaged build we ship a standalone native executable built with
  // PyInstaller (see .github/workflows/release.yml). In development we run
  // the raw .py file via the system python3 for fast iteration.
  const baseName = scriptName.replace(/\.py$/, "");

  if (app.isPackaged) {
    const ext = process.platform === "win32" ? ".exe" : "";
    const binPath = join(process.resourcesPath, "python-bin", baseName + ext);
    return { cmd: binPath, args: [] };
  }

  const scriptPath = join(app.getAppPath(), "src/main/parsers", scriptName);
  return { cmd: "python3", args: [scriptPath] };
}

export function runPythonParser(
  scriptName: string,
  pdfPath: string
): Promise<PythonCsvRow[]> {
  return new Promise((resolve, reject) => {
    const { cmd, args } = resolveCommand(scriptName);
    const csvPath = join(tmpdir(), `budget-${randomUUID()}.csv`);

    const proc = spawn(cmd, [...args, pdfPath, csvPath]);

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
          delimiter: ",",
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
      const hint = app.isPackaged
        ? `Failed to launch bundled parser "${scriptName}": ${err.message}`
        : `Failed to spawn python3 — is Python 3 installed? (${err.message})`;
      reject(new Error(hint));
    });
  });
}
