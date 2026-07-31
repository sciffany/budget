import { useEffect, useState } from "react";

type ExportState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "success"; path: string }
  | { kind: "error"; message: string };

type ImportState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string };

export default function Settings(): JSX.Element {
  const [dbPath, setDbPath] = useState<string>("");
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });

  useEffect(() => {
    window.api.getDatabasePath().then(setDbPath);
  }, []);

  async function handleExport(): Promise<void> {
    setExportState({ kind: "working" });
    try {
      const result = await window.api.exportDatabase();
      if (!result) {
        setExportState({ kind: "idle" });
        return;
      }
      setExportState({ kind: "success", path: result.path });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportState({ kind: "error", message });
    }
  }

  async function handleImport(): Promise<void> {
    setImportState({ kind: "working" });
    try {
      const result = await window.api.importDatabase();
      if (!result.imported) {
        if (result.error) {
          setImportState({ kind: "error", message: result.error });
        } else {
          setImportState({ kind: "idle" });
        }
        return;
      }
      // On success the main process relaunches the app — we won't get here
      // for long, but leave the UI in a friendly state just in case.
      setImportState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportState({ kind: "error", message });
    }
  }

  async function handleReveal(): Promise<void> {
    await window.api.revealDatabase();
  }

  const exportBusy = exportState.kind === "working";
  const importBusy = importState.kind === "working";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Backup, restore, and app data
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-6">
          {/* Database location */}
          <section className="rounded-lg border border-border bg-accent/10 p-4">
            <h2 className="text-sm font-semibold mb-1">Database location</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Your transactions, accounts, categories, and rules all live in
              this single SQLite file.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background border border-border rounded px-2 py-1.5 truncate">
                {dbPath || "…"}
              </code>
              <button
                onClick={handleReveal}
                disabled={!dbPath}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                Show in Finder
              </button>
            </div>
          </section>

          {/* Export */}
          <section className="rounded-lg border border-border bg-accent/10 p-4">
            <h2 className="text-sm font-semibold mb-1">Export database</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Save a single-file backup of your database. Safe to run while the
              app is open — it uses SQLite's online backup, so the copy is
              always consistent.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                disabled={exportBusy}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {exportBusy ? "Exporting…" : "Export database…"}
              </button>
              {exportState.kind === "success" && (
                <span className="text-xs text-emerald-400 truncate">
                  Exported to {exportState.path}
                </span>
              )}
              {exportState.kind === "error" && (
                <span className="text-xs text-red-400 truncate">
                  {exportState.message}
                </span>
              )}
            </div>
          </section>

          {/* Import */}
          <section className="rounded-lg border border-border bg-accent/10 p-4">
            <h2 className="text-sm font-semibold mb-1">Import database</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Replace your current database with one exported from another
              machine. Your current data will be overwritten and the app will
              restart.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importBusy}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {importBusy ? "Importing…" : "Import database…"}
              </button>
              {importState.kind === "error" && (
                <span className="text-xs text-red-400 truncate">
                  {importState.message}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Tip: export your current data first if you want a rollback point.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
