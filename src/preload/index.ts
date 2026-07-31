import { contextBridge, ipcRenderer } from "electron";
import log from "electron-log/preload";

// log.initialize();
// webUtils must be required at runtime in the preload context
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { webUtils } = require("electron") as typeof import("electron");
import { IPC } from "../main/ipc/channels";
import type {
  Account,
  BulkImportRequestItem,
  BulkImportResult,
  BulkImportScan,
  Category,
  CategoryImportResult,
  Heading,
  Import,
  ImportPreviewItem,
  NewAccount,
  NewCategory,
  NewHeading,
  NewRule,
  NewTransaction,
  ReportRow,
  Rule,
  RuleDiffRow,
  RuleImportResult,
  Transaction,
  TransactionFilter,
} from "../shared/types";

const api = {
  // Accounts
  listAccounts: (): Promise<Account[]> => ipcRenderer.invoke(IPC.ACCOUNTS_LIST),
  createAccount: (data: NewAccount): Promise<Account> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_CREATE, data),
  updateAccount: (id: number, data: NewAccount): Promise<Account> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_UPDATE, id, data),
  deleteAccount: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.ACCOUNTS_DELETE, id),

  // Headings
  listHeadings: (): Promise<Heading[]> => ipcRenderer.invoke(IPC.HEADINGS_LIST),
  createHeading: (data: NewHeading): Promise<Heading> =>
    ipcRenderer.invoke(IPC.HEADINGS_CREATE, data),
  updateHeading: (id: number, data: NewHeading): Promise<Heading> =>
    ipcRenderer.invoke(IPC.HEADINGS_UPDATE, id, data),
  deleteHeading: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.HEADINGS_DELETE, id),
  reorderHeadings: (orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.HEADINGS_REORDER, orderedIds),

  // Categories
  listCategories: (): Promise<Category[]> =>
    ipcRenderer.invoke(IPC.CATEGORIES_LIST),
  createCategory: (data: NewCategory): Promise<Category> =>
    ipcRenderer.invoke(IPC.CATEGORIES_CREATE, data),
  updateCategory: (id: number, data: NewCategory): Promise<Category> =>
    ipcRenderer.invoke(IPC.CATEGORIES_UPDATE, id, data),
  deleteCategory: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),
  reorderCategories: (headingId: number, orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.CATEGORIES_REORDER, headingId, orderedIds),
  exportCategories: (): Promise<{ path: string; count: number } | null> =>
    ipcRenderer.invoke(IPC.CATEGORIES_EXPORT),
  importCategories: (): Promise<CategoryImportResult | null> =>
    ipcRenderer.invoke(IPC.CATEGORIES_IMPORT),

  // Transactions
  listTransactions: (filter: TransactionFilter): Promise<Transaction[]> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_LIST, filter),
  createTransaction: (data: NewTransaction): Promise<Transaction> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_CREATE, data),
  updateTransactionCategory: (id: number, categoryId: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_UPDATE_CATEGORY, id, categoryId),
  updateTransactionDate: (id: number, date: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_UPDATE_DATE, id, date),
  updateTransactionAccount: (id: number, accountId: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_UPDATE_ACCOUNT, id, accountId),
  deleteTransaction: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TRANSACTIONS_DELETE, id),

  // Rules
  listRules: (): Promise<Rule[]> => ipcRenderer.invoke(IPC.RULES_LIST),
  createRule: (data: NewRule): Promise<Rule> =>
    ipcRenderer.invoke(IPC.RULES_CREATE, data),
  updateRule: (id: number, data: NewRule): Promise<Rule> =>
    ipcRenderer.invoke(IPC.RULES_UPDATE, id, data),
  deleteRule: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.RULES_DELETE, id),
  reorderRules: (orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke(IPC.RULES_REORDER, orderedIds),
  previewRules: (): Promise<RuleDiffRow[]> =>
    ipcRenderer.invoke(IPC.RULES_PREVIEW),
  applyRules: (): Promise<void> => ipcRenderer.invoke(IPC.RULES_APPLY),
  exportRules: (): Promise<{ path: string; count: number } | null> =>
    ipcRenderer.invoke(IPC.RULES_EXPORT),
  importRules: (): Promise<RuleImportResult | null> =>
    ipcRenderer.invoke(IPC.RULES_IMPORT),

  // Import
  detectParser: (
    filepath: string
  ): Promise<{ parserId: string; displayName: string } | null> =>
    ipcRenderer.invoke(IPC.IMPORT_DETECT, filepath),
  parseFile: (
    filepath: string,
    parserId?: string
  ): Promise<ImportPreviewItem[]> =>
    ipcRenderer.invoke(IPC.IMPORT_PARSE, filepath, parserId),
  commitImport: (
    filepath: string,
    parserId: string,
    accountId: number,
    selectedRows: ImportPreviewItem[]
  ): Promise<{ importId: number; inserted: number }> =>
    ipcRenderer.invoke(
      IPC.IMPORT_COMMIT,
      filepath,
      parserId,
      accountId,
      selectedRows
    ),
  listImports: (): Promise<Import[]> => ipcRenderer.invoke(IPC.IMPORTS_LIST),
  pickBulkImportFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.IMPORT_BULK_PICK_FOLDER),
  scanBulkImportFolder: (rootPath: string): Promise<BulkImportScan> =>
    ipcRenderer.invoke(IPC.IMPORT_BULK_SCAN, rootPath),
  commitBulkImport: (
    items: BulkImportRequestItem[]
  ): Promise<BulkImportResult> =>
    ipcRenderer.invoke(IPC.IMPORT_BULK_COMMIT, items),

  // Reports
  reportSummary: (dateFrom: string, dateTo: string): Promise<ReportRow[]> =>
    ipcRenderer.invoke(IPC.REPORTS_SUMMARY, dateFrom, dateTo),

  // Database backup / restore
  getDatabasePath: (): Promise<string> => ipcRenderer.invoke(IPC.DB_GET_PATH),
  revealDatabase: (): Promise<void> => ipcRenderer.invoke(IPC.DB_REVEAL),
  exportDatabase: (): Promise<{ path: string } | null> =>
    ipcRenderer.invoke(IPC.DB_EXPORT),
  importDatabase: (): Promise<{ imported: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.DB_IMPORT),

  // Utils
  getFilePath: (file: File): string => webUtils.getPathForFile(file),

  // Logging
  log: {
    info: (...args: unknown[]) => log.info(...args),
    warn: (...args: unknown[]) => log.warn(...args),
    error: (...args: unknown[]) => log.error(...args),
    debug: (...args: unknown[]) => log.debug(...args),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
