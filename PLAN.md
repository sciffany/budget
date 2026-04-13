# Budget App — Implementation Plan

## Overview

A desktop finance app built with Electron + TypeScript + SQLite. Users import bank statements
(PDF or CSV), auto-categorize transactions via a rules engine, and report on spending by category.
The emphasis is on **change in balance** rather than absolute balance, and on **rules-driven
categorization** rather than manual tagging.

---

## Tech Stack

| Layer         | Choice                       | Reason                                            |
| ------------- | ---------------------------- | ------------------------------------------------- |
| Shell         | Electron + electron-vite     | Native file access, cross-platform                |
| Language      | TypeScript (strict)          | End-to-end type safety across main/renderer       |
| Database      | SQLite via `better-sqlite3`  | Embedded, synchronous, good perf for local data   |
| UI            | React + shadcn/ui + Tailwind | Component library with good table/form primitives |
| PDF parsing   | `pdf-parse`                  | Text extraction from structured bank PDFs         |
| CSV parsing   | `papaparse`                  | Robust CSV with encoding detection                |
| Date handling | `date-fns`                   | Lightweight, tree-shakeable                       |
| Build/package | `electron-builder`           | macOS/Windows distributables                      |

No OCR. PDF parsing relies entirely on embedded text extraction via `pdf-parse`.

---

## Data Model

### `accounts`

| Column      | Type       | Notes                                      |
| ----------- | ---------- | ------------------------------------------ |
| id          | INTEGER PK |                                            |
| name        | TEXT       | Display name, e.g. "OCBC 360"              |
| institution | TEXT       | e.g. "OCBC", "DBS", "PayLah"               |
| type        | TEXT       | `checking`, `savings`, `credit`, `ewallet` |
| currency    | TEXT       | ISO 4217, e.g. "SGD"                       |

No opening balance — the app tracks flows, not snapshots.

---

### `headings`

| Column        | Type       | Notes                                    |
| ------------- | ---------- | ---------------------------------------- |
| id            | INTEGER PK |                                          |
| name          | TEXT       | e.g. "Daily", "Subscriptions", "Special" |
| display_order | INTEGER    |                                          |

---

### `categories`

| Column        | Type       | Notes                           |
| ------------- | ---------- | ------------------------------- |
| id            | INTEGER PK |                                 |
| heading_id    | INTEGER FK | `headings.id`                   |
| name          | TEXT       | e.g. "Food", "Rent", "Salary"   |
| type          | TEXT       | `expense`, `income`, `transfer` |
| display_order | INTEGER    |                                 |

**Category type is the classification unit.** A category of type `expense` can hold both
outgoing payments and incoming reimbursements — the net of all transactions in the category
is reported as the expense figure. Example: "Rental" (expense) holds −3700 rent payment
and +2300 housemate reimbursements → net −1400 shown in reports.

A built-in **Default** category (type `expense`) catches all uncategorized transactions.
It cannot be deleted.

---

### `transactions`

| Column      | Type       | Notes                                         |
| ----------- | ---------- | --------------------------------------------- |
| id          | INTEGER PK |                                               |
| account_id  | INTEGER FK | `accounts.id`                                 |
| date        | TEXT       | ISO 8601 date                                 |
| payee       | TEXT       | Raw payee string from statement               |
| amount      | REAL       | Positive = credit, negative = debit           |
| category_id | INTEGER FK | `categories.id`, defaults to Default category |
| import_id   | INTEGER FK | `imports.id`, nullable for manual entries     |

No transfer-linking columns. The category type (`transfer`) is sufficient for reporting
purposes. Users classify a transaction as a transfer by assigning it to any `transfer`
category. No two-leg reconciliation.

---

### `rules`

| Column      | Type       | Notes                                          |
| ----------- | ---------- | ---------------------------------------------- |
| id          | INTEGER PK |                                                |
| category_id | INTEGER FK | `categories.id`                                |
| keyword     | TEXT       | Case-insensitive substring match against payee |
| amount_min  | REAL       | Nullable — no lower bound if null              |
| amount_max  | REAL       | Nullable — no upper bound if null              |

**Rule priority** is stored globally as a JSON array of rule IDs in the `settings` table
(`key = 'rule_priority'`, `value = '[3,1,7,2,...]'`). First matching rule in this ordered
list wins. The UI lets users drag-reorder rules. If a transaction matches no rule, it stays
in (or is assigned to) the Default category.

Substring matching is case-insensitive. Regex support can be added later by storing a
`match_mode` column (`substring` | `regex`); the engine checks this field before matching.

---

### `rule_priority` (settings table pattern)

| Column | Type    | Notes              |
| ------ | ------- | ------------------ |
| key    | TEXT PK |                    |
| value  | TEXT    | JSON-encoded value |

`rule_priority` → `"[5, 2, 8, 1, ...]"` (ordered array of rule IDs)

---

### `imports`

| Column            | Type       | Notes                            |
| ----------------- | ---------- | -------------------------------- |
| id                | INTEGER PK |                                  |
| filename          | TEXT       | Original filename                |
| bank_type         | TEXT       | Parser ID that handled this file |
| format            | TEXT       | `pdf` or `csv`                   |
| imported_at       | TEXT       | ISO 8601 datetime                |
| transaction_count | INTEGER    | How many rows were committed     |

---

## Feature Breakdown

### 1. Accounts

- CRUD for accounts (name, institution, type, currency)
- No balance tracking — account is just a label + metadata on transactions

### 2. Headings & Categories

- CRUD for headings with drag-to-reorder
- CRUD for categories nested under a heading, each with a type (expense/income/transfer)
- Default category is always present and protected

### 3. Transactions

- Manual entry form (account, date, payee, amount, category)
- Transaction list with filtering by date range, account, category, heading
- **No inline category picker in the list view** — categorization is done via rules
- Uncategorized transactions (in Default) are visually flagged to prompt rule creation

### 4. Rules Engine

**Rule creation:**

- From the transaction list, user clicks "Create Rule" on a transaction → Rules UI opens with the full payee text pre-filled as the keyword
- User trims the keyword text themselves to the desired substring, sets category and optional amount range
- No custom cell renderer required — no in-cell text selection interaction
- Saving inserts the rule and appends it to the end of `rule_priority` (lowest priority by default)

**Rule management:**

- Dedicated rules screen showing all rules in priority order
- Drag-to-reorder to change global priority
- Edit/delete inline
- Per-category view (which rules feed into this category)

**Run Rules:**

1. User clicks "Run Rules"
2. Engine runs in dry-run mode → computes proposed category changes for all transactions
3. Preview modal shows a diff table: transaction | current category | new category
4. User confirms → changes committed to DB
5. Transactions already matching their correct category are untouched (idempotent)

### 5. Import (PDF / CSV)

**Flow:**

1. User drops or selects one or more files
2. Auto-detection identifies the bank/format for each file
3. Parser extracts raw transactions
4. **Preview screen** shows extracted rows with parsed fields; user can:
   - Correct the detected account
   - Deselect rows to exclude
   - See any rows that failed to parse (highlighted in red)
5. User confirms → rows inserted, import record created, rules engine runs automatically

**Bank detection strategy:**

- Match filename patterns first (fast path)
- Fall back to inspecting first N lines of extracted text for known header patterns
- If detection fails, prompt user to select the bank manually from a dropdown

### 6. Reporting

- Net flow by heading/category for a selected date range
- Separate totals for expense / income / transfer categories
- Simple bar or table view — no complex charting in v1

---

## Bank Parser Architecture

```typescript
interface ParsedTransaction {
  date: string; // ISO 8601
  payee: string;
  amount: number; // positive = credit, negative = debit
  rawLine?: string; // original text for debugging
}

interface ParseResult {
  transactions: ParsedTransaction[];
  suggestedAccountName: string;
  statementPeriod?: { from: string; to: string };
}

interface BankParser {
  readonly id: string; // e.g. "uobCredit", "paylah", "dbsChecking"
  readonly displayName: string;
  readonly formats: ("pdf" | "csv")[];

  /** Return confidence 0–1. >0.5 = this parser should handle the file. */
  detect(filename: string, extractedText: string): number;

  parse(filepath: string): Promise<ParseResult>;
}

class ParserRegistry {
  private parsers: BankParser[] = [];

  register(parser: BankParser): void;

  /** Returns parser with highest detection confidence, or throws if none > 0.5 */
  async detect(filepath: string): Promise<BankParser>;

  /** All parsers, for manual override in UI */
  list(): BankParser[];
}
```

Each parser lives in `src/main/parsers/<bankId>.ts`. Adding support for a new bank = adding
one file and one `registry.register(new XYZParser())` call.

PDF parsers use `pdf-parse` to extract text, then apply regex/split logic specific to that
bank's statement layout. CSV parsers use `papaparse` with bank-specific column mappings.

---

## Process Architecture

```
renderer (React + Vite)
    │
    │  contextBridge — typed IPC channels
    ▼
preload.ts
    │
main process
    ├── db/
    │     schema.ts          CREATE TABLE statements + migrations
    │     queries/           one file per domain (accounts, transactions, rules, …)
    │
    ├── parsers/
    │     registry.ts
    │     uobCredit.ts
    │     paylah.ts
    │     (+ more as needed)
    │
    ├── rules/
    │     engine.ts          preview() and apply()
    │
    └── ipc/
          handlers.ts        registers all ipcMain.handle() calls
          channels.ts        shared channel name constants + request/response types
```

All file I/O, DB access, and PDF/CSV parsing happen in the **main process**. The renderer
never touches the filesystem or SQLite directly.

---

## Folder Structure

```
budget/
├── src/
│   ├── main/
│   │   ├── index.ts              Electron entry, creates window, registers IPC
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── queries/
│   │   │       ├── accounts.ts
│   │   │       ├── transactions.ts
│   │   │       ├── categories.ts
│   │   │       ├── rules.ts
│   │   │       └── imports.ts
│   │   ├── parsers/
│   │   │   ├── registry.ts
│   │   │   ├── uobCredit.ts
│   │   │   └── paylah.ts
│   │   ├── rules/
│   │   │   └── engine.ts
│   │   └── ipc/
│   │       ├── channels.ts
│   │       └── handlers.ts
│   │
│   ├── preload/
│   │   └── index.ts
│   │
│   ├── renderer/
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── TransactionTable.tsx
│   │   │   ├── RuleEditor.tsx
│   │   │   ├── CategoryTree.tsx
│   │   │   ├── ImportPreview.tsx
│   │   │   └── RunRulesModal.tsx
│   │   └── pages/
│   │       ├── Transactions.tsx
│   │       ├── Import.tsx
│   │       ├── Categories.tsx
│   │       ├── Rules.tsx
│   │       └── Reports.tsx
│   │
│   └── shared/
│       └── types.ts              DTOs shared between main and renderer
│
├── electron.vite.config.ts
├── electron-builder.config.ts
├── package.json
└── PLAN.md
```

---

## Key Dependencies

| Package                     | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `better-sqlite3`            | Synchronous SQLite in main process              |
| `pdf-parse`                 | Text extraction from bank PDF statements        |
| `papaparse`                 | CSV parsing with encoding detection             |
| `electron-vite`             | Vite-based build for Electron (main + renderer) |
| `electron-builder`          | Package and distribute for macOS/Windows        |
| `react` + `react-dom`       | Renderer UI                                     |
| `shadcn/ui` + `tailwindcss` | Component library                               |
| `@dnd-kit/core`             | Drag-to-reorder for rules priority list         |
| `date-fns`                  | Date parsing and formatting                     |

---

## Decisions

1. **Rule creation** — No custom cell renderer. "Create Rule" copies the full payee string
   into the rules UI; the user trims it to the desired keyword themselves.

2. **Regex mode for rules** — reserved as a future `match_mode` column in the schema. Not
   in scope for v1.

3. **Multi-currency** — the rules engine and reports assume a single currency. The `currency`
   field on `accounts` is stored for reference but not used in aggregation. FX handling is
   post-v1.

4. **Duplicate detection on import** — two-tier strategy:

   - **Hard duplicate**: account + date + payee + amount all identical → silently drop on
     import (never inserted).
   - **Soft duplicate**: payee + amount identical but date differs → flagged in the import
     preview screen for the user to review and deselect if needed.

5. **Budget targets** — not in scope. Reports show actuals only (net flow by
   category/heading for a date range). Trend charts and planned-vs-actual views are post-v1.

---

## Build Sequence

1. Scaffold with `electron-vite` + React + TypeScript template
2. Wire `better-sqlite3` in main process; implement schema + migrations
3. Implement IPC channel definitions and preload bridge
4. Build accounts + categories + headings CRUD (backend + UI)
5. Build transaction list page (display only, manual entry form)
6. Implement `UOBCreditParser` and `PayLahParser` + `ParserRegistry`
7. Build import flow: file picker → detect → preview → commit
8. Implement rules engine: `preview()` + `apply()`
9. Build rules management UI: list, drag-reorder, create-from-highlight popover
10. Build "Run Rules" modal with diff preview
11. Build reports page
12. Polish: empty states, error handling, keyboard shortcuts
