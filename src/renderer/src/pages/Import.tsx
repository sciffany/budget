import { useState, useRef, useEffect } from "react";
import type { Account, ImportPreviewItem } from "@shared/types";
import { formatAmount, formatDate, cn } from "../lib/utils";

export default function Import(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filepath, setFilepath] = useState<string | null>(null);
  const [parserId, setParserId] = useState<string | null>(null);
  const [parserName, setParserName] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rows, setRows] = useState<ImportPreviewItem[]>([]);
  const [step, setStep] = useState<"idle" | "preview" | "done">("idle");
  const [result, setResult] = useState<{
    importId: number;
    inserted: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  async function handleFile(file: File): Promise<void> {
    const path = window.api.getFilePath(file);
    if (!path) return;

    setLoading(true);
    setFilepath(path);

    const [accs, detected, preview] = await Promise.all([
      window.api.listAccounts(),
      window.api.detectParser(path),
      window.api.parseFile(path),
    ]);

    setAccounts(accs);
    if (detected) {
      setParserId(detected.parserId);
      setParserName(detected.displayName);
    }
    setRows(preview);
    setAccountId(accs[0]?.id ?? null);
    setStep("preview");
    setLoading(false);
  }

  async function handleCommit(): Promise<void> {
    if (!filepath || !parserId || !accountId) return;
    setLoading(true);
    const r = await window.api.commitImport(
      filepath,
      parserId,
      accountId,
      rows
    );
    setResult(r);
    setStep("done");
    setLoading(false);
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-4xl">✓</div>
        <p className="text-lg font-medium">Import complete</p>
        <p className="text-sm text-muted-foreground">
          {result.inserted} transactions imported (rules applied automatically)
        </p>
        <button
          onClick={() => {
            setStep("idle");
            setRows([]);
            setFilepath(null);
          }}
          className="mt-2 px-4 py-2 rounded-md bg-accent text-sm hover:bg-accent/80 transition-colors"
        >
          Import another file
        </button>
      </div>
    );
  }

  if (step === "preview") {
    const selected = rows.filter((r) => r.selected).length;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-4">
          <div>
            <h1 className="text-lg font-semibold">Import Preview</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {parserName ?? "Unknown bank"} · {rows.length} rows · {selected}{" "}
              selected
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={accountId ?? ""}
              onChange={(e) => setAccountId(Number(e.target.value))}
              className="text-sm bg-accent border border-border rounded px-2 py-1"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              disabled={loading || selected === 0 || !accountId}
              onClick={handleCommit}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {loading ? "Importing…" : "Commit"}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr>
                <th className="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={rows.every((r) => r.selected)}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((r) => ({ ...r, selected: e.target.checked }))
                      )
                    }
                  />
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium w-28">
                  Date
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Payee
                </th>
                <th className="text-right px-6 py-2 text-muted-foreground font-medium w-32">
                  Amount
                </th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-border/50",
                    !row.selected && "opacity-40",
                    row.softDuplicateIds.length > 0 && "bg-yellow-900/10"
                  )}
                >
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((r, idx) =>
                            idx === i ? { ...r, selected: e.target.checked } : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate">{row.payee}</td>
                  <td
                    className={cn(
                      "px-6 py-2 text-right tabular-nums font-mono",
                      row.amount >= 0 ? "text-emerald-400" : ""
                    )}
                  >
                    {row.amount >= 0 ? "+" : "-"}
                    {formatAmount(row.amount)}
                  </td>
                  <td className="px-3 py-2 text-xs text-yellow-500">
                    {row.softDuplicateIds.length > 0
                      ? "Possible duplicate"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-accent/30"
            : "border-border hover:border-primary/50 hover:bg-accent/20"
        )}
        onClick={() => {
          inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <span className="text-5xl text-muted-foreground">↑</span>
        <div className="text-center">
          <p className="font-medium">Drop a bank statement here</p>
          <p className="text-sm text-muted-foreground mt-1">
            PDF or CSV · UOB Credit · DBS PayLah!
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
      {loading && (
        <p className="text-sm text-muted-foreground">Parsing file…</p>
      )}
    </div>
  );
}
