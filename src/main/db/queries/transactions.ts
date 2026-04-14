import { getDb } from '../schema'
import type { Transaction, NewTransaction, TransactionFilter } from '@shared/types'

export function listTransactions(filter: TransactionFilter = {}): Transaction[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.accountId) {
    conditions.push('t.account_id = ?')
    params.push(filter.accountId)
  }
  if (filter.categoryId) {
    conditions.push('t.category_id = ?')
    params.push(filter.categoryId)
  }
  if (filter.headingId) {
    conditions.push('c.heading_id = ?')
    params.push(filter.headingId)
  }
  if (filter.dateFrom) {
    conditions.push('t.date >= ?')
    params.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    conditions.push('t.date <= ?')
    params.push(filter.dateTo)
  }
  if (filter.uncategorised) {
    conditions.push('c.protected = 1')
  }
  if (filter.search) {
    conditions.push('t.payee LIKE ?')
    params.push(`%${filter.search}%`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return getDb()
    .prepare(
      `SELECT t.*, c.name AS category_name, c.type AS category_type, c.heading_id,
              a.name AS account_name
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN accounts a ON a.id = t.account_id
       ${where}
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(...params) as Transaction[]
}

export function createTransaction(data: NewTransaction): Transaction {
  const db = getDb()
  const id = (
    db
      .prepare(
        'INSERT INTO transactions (account_id, date, payee, amount, category_id, import_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
      )
      .get(
        data.account_id,
        data.date,
        data.payee,
        data.amount,
        data.category_id,
        data.import_id ?? null
      ) as { id: number }
  ).id
  return listTransactions({})[0] // re-fetch with joins — simple but fine for single inserts
    ?? (db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction)
}

export function updateTransactionCategory(id: number, categoryId: number): void {
  getDb().prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(categoryId, id)
}

export function updateTransactionDate(id: number, date: string): void {
  getDb().prepare('UPDATE transactions SET date = ? WHERE id = ?').run(date, id)
}

export function updateTransactionAccount(id: number, accountId: number): void {
  getDb().prepare('UPDATE transactions SET account_id = ? WHERE id = ?').run(accountId, id)
}

export function deleteTransaction(id: number): void {
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id)
}

interface DuplicateCheck {
  hardDuplicate: boolean
  softDuplicateIds: number[]
}

export function checkDuplicate(
  accountId: number,
  date: string,
  payee: string,
  amount: number
): DuplicateCheck {
  const db = getDb()

  const hard = db
    .prepare(
      'SELECT id FROM transactions WHERE account_id=? AND date=? AND payee=? AND amount=?'
    )
    .get(accountId, date, payee, amount)

  if (hard) return { hardDuplicate: true, softDuplicateIds: [] }

  const soft = db
    .prepare('SELECT id FROM transactions WHERE payee=? AND amount=? AND date != ?')
    .all(payee, amount, date) as { id: number }[]

  return { hardDuplicate: false, softDuplicateIds: soft.map((r) => r.id) }
}

export function bulkInsertTransactions(
  rows: NewTransaction[],
  importId: number
): number {
  const db = getDb()
  const insert = db.prepare(
    'INSERT INTO transactions (account_id, date, payee, amount, category_id, import_id) VALUES (?, ?, ?, ?, ?, ?)'
  )
  let inserted = 0
  const insertAll = db.transaction(() => {
    for (const row of rows) {
      const { hardDuplicate } = checkDuplicate(
        row.account_id,
        row.date,
        row.payee,
        row.amount
      )
      if (!hardDuplicate) {
        insert.run(row.account_id, row.date, row.payee, row.amount, row.category_id, importId)
        inserted++
      }
    }
  })
  insertAll()
  return inserted
}
