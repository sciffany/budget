import { ipcMain } from "electron";
import { IPC } from "./channels";
import * as accounts from "../db/queries/accounts";
import * as categories from "../db/queries/categories";
import * as transactions from "../db/queries/transactions";
import * as rules from "../db/queries/rules";
import * as imports from "../db/queries/imports";
import { rulesPreview, rulesApply } from "../rules/engine";
import { parserRegistry } from "../parsers/registry";
import { getDb } from "../db/schema";
import { format } from "date-fns";
import type {
  NewAccount,
  NewCategory,
  NewHeading,
  NewRule,
  NewTransaction,
  TransactionFilter,
  ImportPreviewItem,
} from "@shared/types";

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
}
