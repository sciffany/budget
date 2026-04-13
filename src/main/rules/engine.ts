import { getDb } from '../db/schema'
import { listRules } from '../db/queries/rules'
import { getDefaultCategoryId } from '../db/queries/categories'
import type { Rule, RuleDiffRow, Transaction } from '@shared/types'

function matchesRule(rule: Rule, tx: Transaction): boolean {
  const keywordMatch = tx.payee.toLowerCase().includes(rule.keyword.toLowerCase())
  if (!keywordMatch) return false

  if (rule.amount_min !== null && tx.amount < rule.amount_min) return false
  if (rule.amount_max !== null && tx.amount > rule.amount_max) return false

  return true
}

function applyRulesToTransaction(
  tx: Transaction,
  orderedRules: Rule[]
): number {
  for (const rule of orderedRules) {
    if (matchesRule(rule, tx)) return rule.category_id
  }
  return tx.category_id // no match → keep existing
}

export function rulesPreview(): RuleDiffRow[] {
  const db = getDb()
  const orderedRules = listRules()
  const defaultCatId = getDefaultCategoryId()

  const allTx = db
    .prepare(
      `SELECT t.*, c.name AS category_name
       FROM transactions t
       JOIN categories c ON c.id = t.category_id`
    )
    .all() as Transaction[]

  const catNames = new Map<number, string>(
    (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map(
      (c) => [c.id, c.name]
    )
  )

  const diff: RuleDiffRow[] = []

  for (const tx of allTx) {
    const newCatId = applyRulesToTransaction(tx, orderedRules)
    if (newCatId !== tx.category_id) {
      diff.push({
        transactionId: tx.id,
        date: tx.date,
        payee: tx.payee,
        amount: tx.amount,
        currentCategoryId: tx.category_id,
        currentCategoryName: tx.category_name ?? '?',
        newCategoryId: newCatId,
        newCategoryName: catNames.get(newCatId) ?? '?',
      })
    }
  }

  return diff
}

export function rulesApply(): void {
  const db = getDb()
  const orderedRules = listRules()

  if (orderedRules.length === 0) return

  const allTx = db
    .prepare('SELECT * FROM transactions')
    .all() as Transaction[]

  const update = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?')

  const applyAll = db.transaction(() => {
    for (const tx of allTx) {
      const newCatId = applyRulesToTransaction(tx, orderedRules)
      if (newCatId !== tx.category_id) {
        update.run(newCatId, tx.id)
      }
    }
  })

  applyAll()
}
