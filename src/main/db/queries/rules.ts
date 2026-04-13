import { getDb } from '../schema'
import type { Rule, NewRule } from '@shared/types'

export function listRules(): Rule[] {
  const db = getDb()
  const priorityRaw = (
    db.prepare("SELECT value FROM settings WHERE key='rule_priority'").get() as
      | { value: string }
      | undefined
  )?.value

  const priority: number[] = priorityRaw ? JSON.parse(priorityRaw) : []
  const all = db.prepare('SELECT * FROM rules').all() as Rule[]

  // Return in priority order, then append any orphaned rules at the end
  const inOrder = priority.flatMap((id) => {
    const r = all.find((rule) => rule.id === id)
    return r ? [r] : []
  })
  const orphaned = all.filter((r) => !priority.includes(r.id))
  return [...inOrder, ...orphaned]
}

export function createRule(data: NewRule): Rule {
  const db = getDb()
  const rule = db
    .prepare(
      'INSERT INTO rules (category_id, keyword, amount_min, amount_max) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .get(data.category_id, data.keyword, data.amount_min ?? null, data.amount_max ?? null) as Rule

  // Append to end of priority list
  const priorityRaw = (
    db.prepare("SELECT value FROM settings WHERE key='rule_priority'").get() as { value: string }
  ).value
  const priority: number[] = JSON.parse(priorityRaw)
  priority.push(rule.id)
  db.prepare("UPDATE settings SET value=? WHERE key='rule_priority'").run(
    JSON.stringify(priority)
  )

  return rule
}

export function updateRule(id: number, data: NewRule): Rule {
  return getDb()
    .prepare(
      'UPDATE rules SET category_id=?, keyword=?, amount_min=?, amount_max=? WHERE id=? RETURNING *'
    )
    .get(data.category_id, data.keyword, data.amount_min ?? null, data.amount_max ?? null, id) as Rule
}

export function deleteRule(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM rules WHERE id = ?').run(id)

  const priorityRaw = (
    db.prepare("SELECT value FROM settings WHERE key='rule_priority'").get() as { value: string }
  ).value
  const priority: number[] = JSON.parse(priorityRaw)
  const updated = priority.filter((rid) => rid !== id)
  db.prepare("UPDATE settings SET value=? WHERE key='rule_priority'").run(JSON.stringify(updated))
}

export function setRulePriority(orderedIds: number[]): void {
  getDb()
    .prepare("UPDATE settings SET value=? WHERE key='rule_priority'")
    .run(JSON.stringify(orderedIds))
}
