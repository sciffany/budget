import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { extname, join } from "path";
import log from "electron-log/main";
import Database from "better-sqlite3";
import { parse as parseCsv, unparse as unparseCsv } from "papaparse";
import { IPC } from "./channels";
import * as accounts from "../db/queries/accounts";
import * as categories from "../db/queries/categories";
import * as transactions from "../db/queries/transactions";
import * as rules from "../db/queries/rules";
import * as imports from "../db/queries/imports";
import { rulesPreview, rulesApply } from "../rules/engine";
import { parserRegistry } from "../parsers/registry";
import { closeDb, getDb, getDbPath } from "../db/schema";
import { format } from "date-fns";
import type {
  Account,
  BulkImportFile,
  BulkImportFolder,
  BulkImportRequestItem,
  BulkImportResult,
  BulkImportResultItem,
  BulkImportScan,
  NewAccount,
  NewCategory,
  NewHeading,
  NewRule,
  NewTransaction,
  RuleExportRow,
  RuleImportResult,
  TransactionFilter,
  ImportPreviewItem,
} from "@shared/types";

const SUPPORTED_EXTS = new Set(["pdf", "csv"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[\s_\-]+/g, "").trim();
}

function matchAccount(
  folderName: string,
  allAccounts: Account[]
): { accountId: number | null; reason: BulkImportFolder["matchReason"] } {
  const target = slugify(folderName);
  if (!target) return { accountId: null, reason: null };

  const byName = allAccounts.find((a) => slugify(a.name) === target);
  if (byName) return { accountId: byName.id, reason: "name" };

  const byInstitution = allAccounts.find(
    (a) => slugify(a.institution) === target
  );
  if (byInstitution) return { accountId: byInstitution.id, reason: "institution" };

  const partial = allAccounts.find((a) => {
    const n = slugify(a.name);
    const i = slugify(a.institution);
    return (
      n.includes(target) ||
      target.includes(n) ||
      i.includes(target) ||
      target.includes(i)
    );
  });
  if (partial) return { accountId: partial.id, reason: "contains" };

  return { accountId: null, reason: null };
}

async function scanFile(filepath: string): Promise<BulkImportFile> {
  const filename = filepath.split(/[\\/]/).pop() ?? filepath;
  try {
    const parser = await parserRegistry.detect(filepath);
    return {
      filepath,
      filename,
      parserId: parser.id,
      parserName: parser.displayName,
    };
  } catch (err) {
    return {
      filepath,
      filename,
      parserId: null,
      parserName: null,
      detectError: err instanceof Error ? err.message : String(err),
    };
  }
}

function listSupportedFiles(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => {
      if (name.startsWith(".")) return false;
      const full = join(dir, name);
      try {
        if (!statSync(full).isFile()) return false;
      } catch {
        return false;
      }
      const ext = extname(name).toLowerCase().slice(1);
      return SUPPORTED_EXTS.has(ext);
    })
    .map((name) => join(dir, name))
    .sort();
}

function listSubdirectories(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => {
      if (name.startsWith(".")) return false;
      const full = join(dir, name);
      try {
        return statSync(full).isDirectory();
      } catch {
        return false;
      }
    })
    .map((name) => join(dir, name))
    .sort();
}

export function registerIpcHandlers(): void {
  // ─── Accounts ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ACCOUNTS_LIST, () => accounts.listAccounts());
  ipcMain.handle(IPC.ACCOUNTS_CREATE, (_, data: NewAccount) =>
    accounts.createAccount(data)
  );
  ipcMain.handle(IPC.ACCOUNTS_UPDATE, (_, id: number, data: NewAccount) =>
    accounts.updateAccount(id, data)
  );
  ipcMain.handle(IPC.ACCOUNTS_DELETE, (_, id: number) =>
    accounts.deleteAccount(id)
  );

  // ─── Headings ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HEADINGS_LIST, () => categories.listHeadings());
  ipcMain.handle(IPC.HEADINGS_CREATE, (_, data: NewHeading) =>
    categories.createHeading(data)
  );
  ipcMain.handle(IPC.HEADINGS_UPDATE, (_, id: number, data: NewHeading) =>
    categories.updateHeading(id, data)
  );
  ipcMain.handle(IPC.HEADINGS_DELETE, (_, id: number) =>
    categories.deleteHeading(id)
  );
  ipcMain.handle(IPC.HEADINGS_REORDER, (_, orderedIds: number[]) =>
    categories.reorderHeadings(orderedIds)
  );

  // ─── Categories ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CATEGORIES_LIST, () => categories.listCategories());
  ipcMain.handle(IPC.CATEGORIES_CREATE, (_, data: NewCategory) =>
    categories.createCategory(data)
  );
  ipcMain.handle(IPC.CATEGORIES_UPDATE, (_, id: number, data: NewCategory) =>
    categories.updateCategory(id, data)
  );
  ipcMain.handle(IPC.CATEGORIES_DELETE, (_, id: number) =>
    categories.deleteCategory(id)
  );
  ipcMain.handle(
    IPC.CATEGORIES_REORDER,
    (_, headingId: number, orderedIds: number[]) =>
      categories.reorderCategories(headingId, orderedIds)
  );

  // ─── Transactions ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.TRANSACTIONS_LIST, (_, filter: TransactionFilter) =>
    transactions.listTransactions(filter)
  );
  ipcMain.handle(IPC.TRANSACTIONS_CREATE, (_, data: NewTransaction) =>
    transactions.createTransaction(data)
  );
  ipcMain.handle(
    IPC.TRANSACTIONS_UPDATE_CATEGORY,
    (_, id: number, categoryId: number) =>
      transactions.updateTransactionCategory(id, categoryId)
  );
  ipcMain.handle(
    IPC.TRANSACTIONS_UPDATE_DATE,
    (_, id: number, date: string) =>
      transactions.updateTransactionDate(id, date)
  );
  ipcMain.handle(
    IPC.TRANSACTIONS_UPDATE_ACCOUNT,
    (_, id: number, accountId: number) =>
      transactions.updateTransactionAccount(id, accountId)
  );
  ipcMain.handle(IPC.TRANSACTIONS_DELETE, (_, id: number) =>
    transactions.deleteTransaction(id)
  );

  // ─── Rules ─────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.RULES_LIST, () => rules.listRules());
  ipcMain.handle(IPC.RULES_CREATE, (_, data: NewRule) =>
    rules.createRule(data)
  );
  ipcMain.handle(IPC.RULES_UPDATE, (_, id: number, data: NewRule) =>
    rules.updateRule(id, data)
  );
  ipcMain.handle(IPC.RULES_DELETE, (_, id: number) => rules.deleteRule(id));
  ipcMain.handle(IPC.RULES_REORDER, (_, orderedIds: number[]) =>
    rules.setRulePriority(orderedIds)
  );
  ipcMain.handle(IPC.RULES_PREVIEW, () => rulesPreview());
  ipcMain.handle(IPC.RULES_APPLY, () => rulesApply());

  ipcMain.handle(
    IPC.RULES_EXPORT,
    async (): Promise<{ path: string; count: number } | null> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const defaultPath = `budget-rules-${format(
        new Date(),
        "yyyy-MM-dd"
      )}.csv`;
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: "Export rules",
            defaultPath,
            filters: [{ name: "CSV", extensions: ["csv"] }],
          })
        : await dialog.showSaveDialog({
            title: "Export rules",
            defaultPath,
            filters: [{ name: "CSV", extensions: ["csv"] }],
          });
      if (result.canceled || !result.filePath) return null;

      const exportRows = rules.listRulesForExport();
      const csv = unparseCsv(
        exportRows.map((r) => ({
          keyword: r.keyword,
          heading: r.heading,
          category: r.category,
          amount_min: r.amount_min ?? "",
          amount_max: r.amount_max ?? "",
        })),
        {
          columns: [
            "keyword",
            "heading",
            "category",
            "amount_min",
            "amount_max",
          ],
        }
      );
      writeFileSync(result.filePath, csv, "utf8");
      log.info(
        `Exported ${exportRows.length} rules to ${result.filePath}`
      );
      return { path: result.filePath, count: exportRows.length };
    }
  );

  ipcMain.handle(
    IPC.RULES_IMPORT,
    async (): Promise<RuleImportResult | null> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const openResult = win
        ? await dialog.showOpenDialog(win, {
            title: "Import rules",
            filters: [{ name: "CSV", extensions: ["csv"] }],
            properties: ["openFile"],
          })
        : await dialog.showOpenDialog({
            title: "Import rules",
            filters: [{ name: "CSV", extensions: ["csv"] }],
            properties: ["openFile"],
          });
      if (openResult.canceled || openResult.filePaths.length === 0) {
        return null;
      }

      const csvText = readFileSync(openResult.filePaths[0], "utf8");
      const parsed = parseCsv<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
      });

      if (parsed.errors && parsed.errors.length > 0) {
        const first = parsed.errors[0];
        log.warn(`CSV parse errors: ${JSON.stringify(parsed.errors)}`);
        throw new Error(`Could not parse CSV: ${first.message}`);
      }

      const rows: RuleExportRow[] = parsed.data.map((raw) => {
        const parseNum = (v: string | undefined): number | null => {
          if (v === undefined || v === null || v.trim() === "") return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        return {
          keyword: (raw.keyword ?? "").trim(),
          heading: (raw.heading ?? "").trim(),
          category: (raw.category ?? "").trim(),
          amount_min: parseNum(raw.amount_min),
          amount_max: parseNum(raw.amount_max),
        };
      });

      const result = rules.importRulesFromRows(rows);
      log.info(
        `Imported rules: ${result.imported} added, ${result.duplicates} duplicates, ${result.errors.length} errors`
      );
      return result;
    }
  );

  // ─── Import ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_DETECT, async (_, filepath: string) => {
    try {
      const parser = await parserRegistry.detect(filepath);
      return { parserId: parser.id, displayName: parser.displayName };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC.IMPORT_PARSE,
    async (
      _,
      filepath: string,
      parserId?: string
    ): Promise<ImportPreviewItem[]> => {
      if (!filepath) throw new Error("import:parse requires a filepath");
      const parser = parserId
        ? parserRegistry.get(parserId)
        : await parserRegistry.detect(filepath);

      const result = await parser.parse(filepath);
      const defaultCatId = categories.getDefaultCategoryId();

      return result.transactions.map((t) => {
        const { softDuplicateIds } = transactions.checkDuplicate(
          0, // no account selected yet
          t.date,
          t.payee,
          t.amount
        );
        return {
          ...t,
          softDuplicateIds,
          selected: true,
        };
      });
    }
  );

  ipcMain.handle(
    IPC.IMPORT_COMMIT,
    async (
      _,
      filepath: string,
      parserId: string,
      accountId: number,
      selectedRows: ImportPreviewItem[]
    ) => {
      const defaultCatId = categories.getDefaultCategoryId();
      const parser = parserRegistry.get(parserId);
      const result = await parser.parse(filepath);

      const importRecord = imports.createImport({
        filename: filepath.split("/").pop()!,
        bank_type: parserId,
        format: parser.formats[0],
        imported_at: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
        transaction_count: 0,
      });

      const rows = selectedRows
        .filter((r) => r.selected)
        .map((r) => ({
          account_id: accountId,
          date: r.date,
          payee: r.payee,
          amount: r.amount,
          category_id: defaultCatId,
          import_id: importRecord.id,
        }));

      const inserted = transactions.bulkInsertTransactions(
        rows,
        importRecord.id
      );

      // Update import record transaction count
      getDb()
        .prepare("UPDATE imports SET transaction_count = ? WHERE id = ?")
        .run(inserted, importRecord.id);

      // Auto-run rules after import
      rulesApply();

      return { importId: importRecord.id, inserted };
    }
  );

  ipcMain.handle(IPC.IMPORTS_LIST, () => imports.listImports());

  // ─── Bulk folder import ────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_BULK_PICK_FOLDER, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: "Select a folder to bulk import",
          properties: ["openDirectory"],
        })
      : await dialog.showOpenDialog({
          title: "Select a folder to bulk import",
          properties: ["openDirectory"],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC.IMPORT_BULK_SCAN,
    async (_, rootPath: string): Promise<BulkImportScan> => {
      const allAccounts = accounts.listAccounts();
      const subdirs = listSubdirectories(rootPath);
      const folders: BulkImportFolder[] = [];

      for (const dir of subdirs) {
        const folderName = dir.split(/[\\/]/).pop() ?? dir;
        const filesInDir = listSupportedFiles(dir);
        if (filesInDir.length === 0) continue;

        const files = await Promise.all(filesInDir.map(scanFile));
        const { accountId, reason } = matchAccount(folderName, allAccounts);

        folders.push({
          folderName,
          folderPath: dir,
          suggestedAccountId: accountId,
          matchReason: reason,
          files,
          selected: true,
        });
      }

      const looseFilePaths = listSupportedFiles(rootPath);
      const looseFiles = await Promise.all(looseFilePaths.map(scanFile));

      return { rootPath, folders, looseFiles };
    }
  );

  ipcMain.handle(
    IPC.IMPORT_BULK_COMMIT,
    async (
      _,
      items: BulkImportRequestItem[]
    ): Promise<BulkImportResult> => {
      const defaultCatId = categories.getDefaultCategoryId();
      const results: BulkImportResultItem[] = [];
      let totalInserted = 0;
      let succeededFiles = 0;

      for (const item of items) {
        const filename = item.filepath.split(/[\\/]/).pop() ?? item.filepath;
        try {
          const parser = parserRegistry.get(item.parserId);
          const parsed = await parser.parse(item.filepath);

          const importRecord = imports.createImport({
            filename,
            bank_type: parser.id,
            format: parser.formats[0],
            imported_at: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
            transaction_count: 0,
          });

          const rows: NewTransaction[] = parsed.transactions.map((t) => ({
            account_id: item.accountId,
            date: t.date,
            payee: t.payee,
            amount: t.amount,
            category_id: defaultCatId,
            import_id: importRecord.id,
          }));

          const inserted = transactions.bulkInsertTransactions(
            rows,
            importRecord.id
          );

          getDb()
            .prepare("UPDATE imports SET transaction_count = ? WHERE id = ?")
            .run(inserted, importRecord.id);

          results.push({
            filepath: item.filepath,
            filename,
            accountId: item.accountId,
            inserted,
            parsed: parsed.transactions.length,
          });
          totalInserted += inserted;
          succeededFiles += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Bulk import failed for ${filename}: ${message}`);
          results.push({
            filepath: item.filepath,
            filename,
            accountId: item.accountId,
            inserted: 0,
            parsed: 0,
            error: message,
          });
        }
      }

      if (succeededFiles > 0) rulesApply();

      return {
        items: results,
        totalInserted,
        totalFiles: items.length,
        succeededFiles,
      };
    }
  );

  // ─── Reports ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.REPORTS_SUMMARY, (_, dateFrom: string, dateTo: string) => {
    const rows = getDb()
      .prepare(
        `SELECT h.id AS headingId, h.name AS headingName,
                  c.id AS categoryId, c.name AS categoryName, c.type AS categoryType,
                  SUM(t.amount) AS net
           FROM transactions t
           JOIN categories c ON c.id = t.category_id
           JOIN headings h ON h.id = c.heading_id
           WHERE t.date >= ? AND t.date <= ?
           GROUP BY c.id
           ORDER BY h.display_order, c.display_order`
      )
      .all(dateFrom, dateTo);
    return rows;
  });

  // ─── Database backup / restore ─────────────────────────────────────────────
  ipcMain.handle(IPC.DB_GET_PATH, () => getDbPath());

  ipcMain.handle(IPC.DB_REVEAL, () => {
    shell.showItemInFolder(getDbPath());
  });

  ipcMain.handle(
    IPC.DB_EXPORT,
    async (): Promise<{ path: string } | null> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const defaultPath = `budget-backup-${format(
        new Date(),
        "yyyy-MM-dd"
      )}.db`;
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: "Export database",
            defaultPath,
            filters: [{ name: "SQLite database", extensions: ["db"] }],
          })
        : await dialog.showSaveDialog({
            title: "Export database",
            defaultPath,
            filters: [{ name: "SQLite database", extensions: ["db"] }],
          });
      if (result.canceled || !result.filePath) return null;

      // Use SQLite's online backup API — creates a consistent single-file
      // snapshot while the app keeps running (WAL is checkpointed into the copy).
      await getDb().backup(result.filePath);
      log.info(`Database exported to ${result.filePath}`);
      return { path: result.filePath };
    }
  );

  ipcMain.handle(
    IPC.DB_IMPORT,
    async (): Promise<{ imported: boolean; error?: string }> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const openResult = win
        ? await dialog.showOpenDialog(win, {
            title: "Import database",
            filters: [
              {
                name: "SQLite database",
                extensions: ["db", "sqlite", "sqlite3"],
              },
            ],
            properties: ["openFile"],
          })
        : await dialog.showOpenDialog({
            title: "Import database",
            filters: [
              {
                name: "SQLite database",
                extensions: ["db", "sqlite", "sqlite3"],
              },
            ],
            properties: ["openFile"],
          });
      if (openResult.canceled || openResult.filePaths.length === 0) {
        return { imported: false };
      }
      const pickedPath = openResult.filePaths[0];

      // Validate it's a real Budget SQLite database before doing anything
      // destructive.
      try {
        const probe = new Database(pickedPath, {
          readonly: true,
          fileMustExist: true,
        });
        try {
          const row = probe
            .prepare("SELECT version FROM schema_version")
            .get() as { version: number } | undefined;
          if (!row) throw new Error("Missing schema_version row");
          // Sanity check a couple of expected tables exist.
          probe.prepare("SELECT 1 FROM accounts LIMIT 1").get();
          probe.prepare("SELECT 1 FROM transactions LIMIT 1").get();
        } finally {
          probe.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Invalid database file selected for import: ${message}`);
        const errOpts = {
          type: "error" as const,
          title: "Invalid database",
          message: "This file is not a valid Budget database.",
          detail: message,
        };
        if (win) await dialog.showMessageBox(win, errOpts);
        else await dialog.showMessageBox(errOpts);
        return { imported: false, error: message };
      }

      // Confirm the destructive action.
      const confirmOpts = {
        type: "warning" as const,
        title: "Replace database?",
        message: "Replace your current database with the selected file?",
        detail:
          "All current data will be replaced. The app will restart to load the imported database.",
        buttons: ["Cancel", "Replace and restart"],
        defaultId: 0,
        cancelId: 0,
      };
      const confirm = win
        ? await dialog.showMessageBox(win, confirmOpts)
        : await dialog.showMessageBox(confirmOpts);
      if (confirm.response !== 1) return { imported: false };

      // Close the current database so we can safely replace its file.
      try {
        closeDb();
      } catch (err) {
        log.warn(`closeDb() threw before import: ${String(err)}`);
      }

      const dbPath = getDbPath();
      // Remove stale WAL/SHM sidecars from the previous database — otherwise
      // SQLite will try to reconcile them against the new file.
      for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
        try {
          unlinkSync(sidecar);
        } catch {
          /* ignore — sidecar didn't exist */
        }
      }

      try {
        copyFileSync(pickedPath, dbPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Failed to copy imported database into place: ${message}`);
        return { imported: false, error: message };
      }

      log.info(`Database imported from ${pickedPath}`);

      // Give the IPC reply time to reach the renderer before we tear down.
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 150);

      return { imported: true };
    }
  );
}
