import { getDb } from '../schema'
import type {
  Rule,
  NewRule,
  RuleExportRow,
  RuleImportError,
  RuleImportResult
} from '@shared/types'

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

/**
 * List rules in priority order, joined with category + heading names so the
 * CSV export is portable across machines (category IDs aren't stable).
 */
export function listRulesForExport(): RuleExportRow[] {
  const db = getDb()
  const priorityRaw = (
    db.prepare("SELECT value FROM settings WHERE key='rule_priority'").get() as
      | { value: string }
      | undefined
  )?.value
  const priority: number[] = priorityRaw ? JSON.parse(priorityRaw) : []

  const rows = db
    .prepare(
      `SELECT r.id, r.keyword, r.amount_min, r.amount_max,
              c.name AS category, h.name AS heading
         FROM rules r
         JOIN categories c ON c.id = r.category_id
         JOIN headings   h ON h.id = c.heading_id`
    )
    .all() as Array<{
    id: number
    keyword: string
    amount_min: number | null
    amount_max: number | null
    category: string
    heading: string
  }>

  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered: typeof rows = []
  for (const id of priority) {
    const r = byId.get(id)
    if (r) {
      ordered.push(r)
      byId.delete(id)
    }
  }
  // Any rules not in the priority list get appended in insertion order.
  ordered.push(...byId.values())

  return ordered.map(({ keyword, heading, category, amount_min, amount_max }) => ({
    keyword,
    heading,
    category,
    amount_min,
    amount_max
  }))
}

/**
 * Import rules from parsed CSV rows. Categories are resolved by
 * (heading, category) names (case-insensitive). Rules whose category can't be
 * resolved are skipped with an error. Exact duplicates (same category +
 * keyword + amount bounds) are also skipped.
 */
export function importRulesFromRows(rows: RuleExportRow[]): RuleImportResult {
  const db = getDb()
  const errors: RuleImportError[] = []
  let imported = 0
  let duplicates = 0

  // Build a lookup: "heading|category" (lowercased) → category_id
  const categoryLookup = new Map<string, number>()
  const categoryByNameOnly = new Map<string, number[]>()
  const categoryRows = db
    .prepare(
      `SELECT c.id, c.name AS category, h.name AS heading
         FROM categories c
         JOIN headings h ON h.id = c.heading_id`
    )
    .all() as Array<{ id: number; category: string; heading: string }>
  for (const c of categoryRows) {
    const key = `${c.heading.trim().toLowerCase()}|${c.category.trim().toLowerCase()}`
    categoryLookup.set(key, c.id)
    const nameKey = c.category.trim().toLowerCase()
    const existing = categoryByNameOnly.get(nameKey) ?? []
    existing.push(c.id)
    categoryByNameOnly.set(nameKey, existing)
  }

  // Existing rules — for duplicate detection.
  const existingRules = db.prepare('SELECT * FROM rules').all() as Rule[]
  const dupKey = (r: {
    category_id: number
    keyword: string
    amount_min: number | null
    amount_max: number | null
  }): string =>
    [
      r.category_id,
      r.keyword.trim().toLowerCase(),
      r.amount_min ?? '',
      r.amount_max ?? ''
    ].join('|')
  const existingKeys = new Set(existingRules.map(dupKey))

  const priorityRaw = (
    db.prepare("SELECT value FROM settings WHERE key='rule_priority'").get() as { value: string }
  ).value
  const priority: number[] = JSON.parse(priorityRaw)

  const insert = db.prepare(
    'INSERT INTO rules (category_id, keyword, amount_min, amount_max) VALUES (?, ?, ?, ?) RETURNING id'
  )

  const txn = db.transaction((toInsert: RuleExportRow[]) => {
    toInsert.forEach((row, idx) => {
      const rowNum = idx + 2 // 1-indexed + header row
      const keyword = (row.keyword ?? '').trim()
      if (!keyword) {
        errors.push({ row: rowNum, keyword: '', reason: 'Missing keyword' })
        return
      }

      const headingKey = (row.heading ?? '').trim().toLowerCase()
      const categoryKey = (row.category ?? '').trim().toLowerCase()

      let categoryId: number | undefined
      if (headingKey && categoryKey) {
        categoryId = categoryLookup.get(`${headingKey}|${categoryKey}`)
      }
      // Fall back to name-only match, but only if unambiguous.
      if (categoryId === undefined && categoryKey) {
        const matches = categoryByNameOnly.get(categoryKey) ?? []
        if (matches.length === 1) categoryId = matches[0]
        else if (matches.length > 1) {
          errors.push({
            row: rowNum,
            keyword,
            reason: `Category "${row.category}" is ambiguous — set a matching "heading" column`
          })
          return
        }
      }
      if (categoryId === undefined) {
        errors.push({
          row: rowNum,
          keyword,
          reason: `Category "${row.heading || '?'} / ${row.category || '?'}" not found`
        })
        return
      }

      const key = dupKey({
        category_id: categoryId,
        keyword,
        amount_min: row.amount_min,
        amount_max: row.amount_max
      })
      if (existingKeys.has(key)) {
        duplicates += 1
        return
      }
      existingKeys.add(key)

      const inserted = insert.get(
        categoryId,
        keyword,
        row.amount_min ?? null,
        row.amount_max ?? null
      ) as { id: number }
      priority.push(inserted.id)
      imported += 1
    })

    db.prepare("UPDATE settings SET value=? WHERE key='rule_priority'").run(
      JSON.stringify(priority)
    )
  })

  txn(rows)

  return { imported, duplicates, errors, totalRows: rows.length }
}
