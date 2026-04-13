// ─── Domain models (match DB columns) ───────────────────────────────────────

export interface Account {
  id: number
  name: string
  institution: string
  type: 'checking' | 'savings' | 'credit' | 'ewallet'
  currency: string
}

export type NewAccount = Omit<Account, 'id'>

export interface Heading {
  id: number
  name: string
  display_order: number
}

export type NewHeading = Pick<Heading, 'name'>

export interface Category {
  id: number
  heading_id: number
  name: string
  type: 'expense' | 'income' | 'transfer'
  display_order: number
  protected: number
}

export type NewCategory = Pick<Category, 'heading_id' | 'name' | 'type'>

export interface Transaction {
  id: number
  account_id: number
  date: string
  payee: string
  amount: number
  category_id: number
  import_id: number | null
  // Joined fields
  category_name?: string
  category_type?: 'expense' | 'income' | 'transfer'
  heading_id?: number
  account_name?: string
}

export type NewTransaction = Pick<
  Transaction,
  'account_id' | 'date' | 'payee' | 'amount' | 'category_id' | 'import_id'
>

export interface Rule {
  id: number
  category_id: number
  keyword: string
  amount_min: number | null
  amount_max: number | null
}

export type NewRule = Omit<Rule, 'id'>

export interface Import {
  id: number
  filename: string
  bank_type: string
  format: 'pdf' | 'csv'
  imported_at: string
  transaction_count: number
}

export interface TransactionFilter {
  accountId?: number
  categoryId?: number
  headingId?: number
  dateFrom?: string
  dateTo?: string
  uncategorised?: boolean
  search?: string
}

// ─── Parser types ────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date: string
  payee: string
  amount: number
  rawLine?: string
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  suggestedAccountName: string
  statementPeriod?: { from: string; to: string }
}

// ─── Rules engine ────────────────────────────────────────────────────────────

export interface RuleDiffRow {
  transactionId: number
  date: string
  payee: string
  amount: number
  currentCategoryId: number
  currentCategoryName: string
  newCategoryId: number
  newCategoryName: string
}

// ─── Report types ────────────────────────────────────────────────────────────

export interface ReportRow {
  headingId: number
  headingName: string
  categoryId: number
  categoryName: string
  categoryType: 'expense' | 'income' | 'transfer'
  net: number
}

// ─── IPC channel payloads ────────────────────────────────────────────────────

export interface ImportPreviewItem extends ParsedTransaction {
  softDuplicateIds: number[]
  selected: boolean
  parseError?: string
}
