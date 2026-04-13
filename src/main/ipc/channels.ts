export const IPC = {
  // Accounts
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_UPDATE: 'accounts:update',
  ACCOUNTS_DELETE: 'accounts:delete',

  // Headings
  HEADINGS_LIST: 'headings:list',
  HEADINGS_CREATE: 'headings:create',
  HEADINGS_UPDATE: 'headings:update',
  HEADINGS_DELETE: 'headings:delete',
  HEADINGS_REORDER: 'headings:reorder',

  // Categories
  CATEGORIES_LIST: 'categories:list',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  CATEGORIES_REORDER: 'categories:reorder',

  // Transactions
  TRANSACTIONS_LIST: 'transactions:list',
  TRANSACTIONS_CREATE: 'transactions:create',
  TRANSACTIONS_UPDATE_CATEGORY: 'transactions:updateCategory',
  TRANSACTIONS_UPDATE_DATE: 'transactions:updateDate',
  TRANSACTIONS_DELETE: 'transactions:delete',

  // Rules
  RULES_LIST: 'rules:list',
  RULES_CREATE: 'rules:create',
  RULES_UPDATE: 'rules:update',
  RULES_DELETE: 'rules:delete',
  RULES_REORDER: 'rules:reorder',
  RULES_PREVIEW: 'rules:preview',
  RULES_APPLY: 'rules:apply',

  // Import
  IMPORT_DETECT: 'import:detect',
  IMPORT_PARSE: 'import:parse',
  IMPORT_COMMIT: 'import:commit',
  IMPORTS_LIST: 'imports:list',

  // Reports
  REPORTS_SUMMARY: 'reports:summary',
} as const
