import { useState, useRef, useEffect } from "react";
import type {
  Account,
  BulkImportFolder,
  BulkImportRequestItem,
  BulkImportResult,
  BulkImportScan,
  ImportPreviewItem,
} from "@shared/types";
import { formatAmount, formatDate, cn } from "../lib/utils";

type Mode = "single" | "bulk";

// ─── Single-file state ──────────────────────────────────────────────────────
type SingleStep = "idle" | "preview" | "done";

// ─── Bulk state ─────────────────────────────────────────────────────────────
type BulkStep = "idle" | "review" | "importing" | "done";

interface BulkFolderState extends BulkImportFolder {
  /** Per-file selection state (index-aligned with `files`). */
  fileSelected: boolean[];
  /** User-overridden account id, or null to inherit `suggestedAccountId`. */
  accountOverride: number | null;
}

const MATCH_LABEL: Record<NonNullable<BulkImportFolder["matchReason"]>, string> = {
  name: "matched by name",
  institution: "matched by institution",
  contains: "fuzzy match",
};

export default function Import(): JSX.Element {
  const [mode, setMode] = useState<Mode>("single");
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    window.api.listAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-6 pt-4">
        <ModeToggle mode={mode} setMode={setMode} />
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "single" ? (
          <SingleImport accounts={accounts} refreshAccounts={setAccounts} />
        ) : (
          <BulkImport accounts={accounts} refreshAccounts={setAccounts} />
        )}
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}): JSX.Element {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5 bg-accent/20">
      {(["single", "bulk"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            mode === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "single" ? "Single file" : "Bulk folder"}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Single-file import (original flow, extracted into its own component)
// ────────────────────────────────────────────────────────────────────────────

function SingleImport({
  accounts,
  refreshAccounts,
}: {
  accounts: Account[];
  refreshAccounts: (a: Account[]) => void;
}): JSX.Element {
  const [filepath, setFilepath] = useState<string | null>(null);
  const [parserId, setParserId] = useState<string | null>(null);
  const [parserName, setParserName] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rows, setRows] = useState<ImportPreviewItem[]>([]);
  const [step, setStep] = useState<SingleStep>("idle");
  const [result, setResult] = useState<{
    importId: number;
    inserted: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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

    refreshAccounts(accs);
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

// ────────────────────────────────────────────────────────────────────────────
// Bulk folder import
// ────────────────────────────────────────────────────────────────────────────

function BulkImport({
  accounts,
  refreshAccounts,
}: {
  accounts: Account[];
  refreshAccounts: (a: Account[]) => void;
}): JSX.Element {
  const [step, setStep] = useState<BulkStep>("idle");
  const [scanning, setScanning] = useState(false);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<BulkFolderState[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function pickAndScan(): Promise<void> {
    const path = await window.api.pickBulkImportFolder();
    if (!path) return;
    await scan(path);
  }

  async function scan(path: string): Promise<void> {
    setScanning(true);
    try {
      const [scan, accs] = await Promise.all([
        window.api.scanBulkImportFolder(path),
        window.api.listAccounts(),
      ]);
      refreshAccounts(accs);
      setRootPath(scan.rootPath);
      setFolders(fromScan(scan));
      setStep("review");
    } finally {
      setScanning(false);
    }
  }

  function updateFolder(
    idx: number,
    updater: (f: BulkFolderState) => BulkFolderState
  ): void {
    setFolders((fs) => fs.map((f, i) => (i === idx ? updater(f) : f)));
  }

  async function commit(): Promise<void> {
    const items: BulkImportRequestItem[] = [];
    for (const folder of folders) {
      if (!folder.selected) continue;
      const accountId = folder.accountOverride ?? folder.suggestedAccountId;
      if (!accountId) continue;
      folder.files.forEach((file, i) => {
        if (!folder.fileSelected[i]) return;
        if (!file.parserId) return;
        items.push({
          filepath: file.filepath,
          parserId: file.parserId,
          accountId,
        });
      });
    }
    if (items.length === 0) return;
    setStep("importing");
    const r = await window.api.commitBulkImport(items);
    setResult(r);
    setStep("done");
  }

  function reset(): void {
    setStep("idle");
    setRootPath(null);
    setFolders([]);
    setResult(null);
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
        <div className="text-4xl">✓</div>
        <p className="text-lg font-medium">Bulk import complete</p>
        <p className="text-sm text-muted-foreground">
          {result.totalInserted} transactions from {result.succeededFiles}/
          {result.totalFiles} files
        </p>
        <div className="w-full max-w-2xl mt-2 max-h-[50vh] overflow-auto border border-border rounded-lg divide-y divide-border">
          {result.items.map((item) => (
            <div
              key={item.filepath}
              className="px-4 py-2 flex items-center justify-between gap-4 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.filename}</p>
                {item.error && (
                  <p className="text-xs text-red-400 mt-0.5 truncate">
                    {item.error}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {item.error ? (
                  <span className="text-red-400">failed</span>
                ) : (
                  <>
                    {item.inserted} / {item.parsed} inserted
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 rounded-md bg-accent text-sm hover:bg-accent/80 transition-colors"
        >
          Import another folder
        </button>
      </div>
    );
  }

  if (step === "importing") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          Parsing and importing files…
        </p>
      </div>
    );
  }

  if (step === "review") {
    const totalFilesSelected = folders.reduce((n, f) => {
      if (!f.selected) return n;
      const account = f.accountOverride ?? f.suggestedAccountId;
      if (!account) return n;
      return (
        n +
        f.fileSelected.filter((sel, i) => sel && f.files[i].parserId != null)
          .length
      );
    }, 0);

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Bulk Import Review</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {rootPath} · {folders.length} folder(s) ·{" "}
              {totalFilesSelected} file(s) queued
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={totalFilesSelected === 0}
              onClick={commit}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Import {totalFilesSelected} file{totalFilesSelected === 1 ? "" : "s"}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subfolders with importable files were found.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {folders.map((folder, fIdx) => (
                <FolderRow
                  key={folder.folderPath}
                  folder={folder}
                  accounts={accounts}
                  onFolderChange={(u) => updateFolder(fIdx, u)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        onClick={pickAndScan}
        className="border-2 border-dashed rounded-xl p-16 flex flex-col items-center gap-4 cursor-pointer border-border hover:border-primary/50 hover:bg-accent/20 transition-colors"
      >
        <span className="text-5xl text-muted-foreground">⌘</span>
        <div className="text-center max-w-md">
          <p className="font-medium">Bulk import from folder</p>
          <p className="text-sm text-muted-foreground mt-1">
            Point at a folder structured as{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-accent">
              accountName/statement.pdf
            </code>
            . Each subfolder is auto-matched to an account by name.
          </p>
        </div>
        <button
          disabled={scanning}
          onClick={(e) => {
            e.stopPropagation();
            pickAndScan();
          }}
          className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {scanning ? "Scanning…" : "Choose folder…"}
        </button>
      </div>
    </div>
  );
}

function FolderRow({
  folder,
  accounts,
  onFolderChange,
}: {
  folder: BulkFolderState;
  accounts: Account[];
  onFolderChange: (u: (f: BulkFolderState) => BulkFolderState) => void;
}): JSX.Element {
  const effectiveAccount =
    folder.accountOverride ?? folder.suggestedAccountId ?? "";
  const account = accounts.find((a) => a.id === effectiveAccount);
  const filesOk = folder.files.filter((f) => f.parserId != null).length;
  const noAccount = !account;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-accent/10",
        !folder.selected && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <input
          type="checkbox"
          checked={folder.selected}
          onChange={(e) =>
            onFolderChange((f) => ({ ...f, selected: e.target.checked }))
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{folder.folderName}/</span>
            {folder.matchReason && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                {MATCH_LABEL[folder.matchReason]}
              </span>
            )}
            {noAccount && (
              <span className="text-[10px] uppercase tracking-wide text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                pick an account
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {folder.files.length} file(s) · {filesOk} recognised
          </p>
        </div>
        <select
          value={effectiveAccount === "" ? "" : String(effectiveAccount)}
          onChange={(e) => {
            const val = e.target.value === "" ? null : Number(e.target.value);
            onFolderChange((f) => ({ ...f, accountOverride: val }));
          }}
          className={cn(
            "text-sm bg-accent border border-border rounded px-2 py-1",
            noAccount && "border-yellow-500/60"
          )}
        >
          <option value="">— Select account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="divide-y divide-border/40">
        {folder.files.map((file, i) => {
          const disabled = !file.parserId;
          const checked = folder.fileSelected[i] && !disabled;
          return (
            <div
              key={file.filepath}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm",
                disabled && "opacity-60"
              )}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={checked}
                onChange={(e) =>
                  onFolderChange((f) => ({
                    ...f,
                    fileSelected: f.fileSelected.map((s, idx) =>
                      idx === i ? e.target.checked : s
                    ),
                  }))
                }
              />
              <div className="flex-1 min-w-0">
                <p className="truncate">{file.filename}</p>
                {file.detectError && (
                  <p className="text-xs text-red-400 truncate">
                    {file.detectError}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {file.parserName ?? "no parser"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fromScan(scan: BulkImportScan): BulkFolderState[] {
  return scan.folders.map((f) => ({
    ...f,
    accountOverride: null,
    fileSelected: f.files.map((file) => file.parserId != null),
  }));
}
