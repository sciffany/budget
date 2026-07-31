import { getDb } from '../schema'
import type {
  Category,
  CategoryExportRow,
  CategoryImportError,
  CategoryImportResult,
  Heading,
  NewCategory,
  NewHeading
} from '@shared/types'

export function listHeadings(): Heading[] {
  return getDb()
    .prepare('SELECT * FROM headings ORDER BY display_order, id')
    .all() as Heading[]
}

export function createHeading(data: NewHeading): Heading {
  const db = getDb()
  const maxOrder = (
    db.prepare('SELECT MAX(display_order) as m FROM headings').get() as { m: number | null }
  ).m
  return db
    .prepare('INSERT INTO headings (name, display_order) VALUES (?, ?) RETURNING *')
    .get(data.name, (maxOrder ?? -1) + 1) as Heading
}

export function updateHeading(id: number, data: NewHeading): Heading {
  return getDb()
    .prepare('UPDATE headings SET name=? WHERE id=? RETURNING *')
    .get(data.name, id) as Heading
}

export function deleteHeading(id: number): void {
  getDb().prepare('DELETE FROM headings WHERE id = ?').run(id)
}

export function reorderHeadings(orderedIds: number[]): void {
  const db = getDb()
  const update = db.prepare('UPDATE headings SET display_order=? WHERE id=?')
  const updateAll = db.transaction(() => {
    orderedIds.forEach((id, idx) => update.run(idx, id))
  })
  updateAll()
}

export function listCategories(): Category[] {
  return getDb()
    .prepare('SELECT * FROM categories ORDER BY heading_id, display_order, id')
    .all() as Category[]
}

export function createCategory(data: NewCategory): Category {
  const db = getDb()
  const maxOrder = (
    db
      .prepare(
        'SELECT MAX(display_order) as m FROM categories WHERE heading_id = ?'
      )
      .get(data.heading_id) as { m: number | null }
  ).m
  return db
    .prepare(
      'INSERT INTO categories (heading_id, name, type, display_order) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .get(data.heading_id, data.name, data.type, (maxOrder ?? -1) + 1) as Category
}

export function updateCategory(id: number, data: NewCategory): Category {
  return getDb()
    .prepare(
      'UPDATE categories SET heading_id=?, name=?, type=? WHERE id=? AND protected=0 RETURNING *'
    )
    .get(data.heading_id, data.name, data.type, id) as Category
}

export function deleteCategory(id: number): void {
  getDb().prepare('DELETE FROM categories WHERE id = ? AND protected = 0').run(id)
}

export function reorderCategories(headingId: number, orderedIds: number[]): void {
  const db = getDb()
  const update = db.prepare(
    'UPDATE categories SET display_order=? WHERE id=? AND heading_id=?'
  )
  const updateAll = db.transaction(() => {
    orderedIds.forEach((id, idx) => update.run(idx, id, headingId))
  })
  updateAll()
}

export function getDefaultCategoryId(): number {
  const row = getDb()
    .prepare('SELECT id FROM categories WHERE protected = 1 LIMIT 1')
    .get() as { id: number } | undefined
  if (!row) throw new Error('Default category missing — schema was not initialised correctly')
  return row.id
}

const VALID_CATEGORY_TYPES: ReadonlyArray<CategoryExportRow['type']> = [
  'expense',
  'income',
  'transfer'
]

/**
 * List every user-defined (non-protected) category joined with its heading so the
 * CSV is portable across machines. Ordered by heading display order, then by
 * the category's display order — so re-exporting after re-arrangement produces
 * a stable file.
 */
export function listCategoriesForExport(): CategoryExportRow[] {
  return getDb()
    .prepare(
      `SELECT h.name AS heading, c.name AS category, c.type AS type
         FROM categories c
         JOIN headings h ON h.id = c.heading_id
        WHERE c.protected = 0
        ORDER BY h.display_order, h.id, c.display_order, c.id`
    )
    .all() as CategoryExportRow[]
}

/**
 * Non-destructive merge import for categories.
 *
 * - Creates any heading that isn't already present (case-insensitive match).
 * - Creates categories that don't yet exist under their heading.
 * - Skips exact duplicates (same heading + category name, case-insensitive).
 * - Skips protected rows entirely — never modified.
 * - Rows with an invalid type or missing name are reported as errors.
 */
export function importCategoriesFromRows(rows: CategoryExportRow[]): CategoryImportResult {
  const db = getDb()
  const errors: CategoryImportError[] = []
  let headingsCreated = 0
  let categoriesCreated = 0
  let duplicates = 0

  const existingHeadings = db.prepare('SELECT * FROM headings').all() as Heading[]
  const headingByName = new Map<string, Heading>()
  for (const h of existingHeadings) {
    headingByName.set(h.name.trim().toLowerCase(), h)
  }

  const existingCategories = db.prepare('SELECT * FROM categories').all() as Category[]
  // key: `${heading_id}|${lowercased category name}`
  const categoryKey = (headingId: number, name: string): string =>
    `${headingId}|${name.trim().toLowerCase()}`
  const existingKeys = new Set(
    existingCategories.map((c) => categoryKey(c.heading_id, c.name))
  )

  let maxHeadingOrder = (
    db.prepare('SELECT MAX(display_order) as m FROM headings').get() as {
      m: number | null
    }
  ).m
  maxHeadingOrder = maxHeadingOrder ?? -1

  const nextCategoryOrder = new Map<number, number>()
  for (const c of existingCategories) {
    const cur = nextCategoryOrder.get(c.heading_id) ?? -1
    if (c.display_order > cur) nextCategoryOrder.set(c.heading_id, c.display_order)
  }

  const insertHeading = db.prepare(
    'INSERT INTO headings (name, display_order) VALUES (?, ?) RETURNING *'
  )
  const insertCategory = db.prepare(
    'INSERT INTO categories (heading_id, name, type, display_order) VALUES (?, ?, ?, ?)'
  )

  const txn = db.transaction((toInsert: CategoryExportRow[]) => {
    toInsert.forEach((raw, idx) => {
      const rowNum = idx + 2 // 1-indexed + header row
      const headingName = (raw.heading ?? '').trim()
      const categoryName = (raw.category ?? '').trim()
      const type = ((raw.type ?? '') as string).trim().toLowerCase() as
        | CategoryExportRow['type']
        | ''

      if (!headingName) {
        errors.push({
          row: rowNum,
          heading: '',
          category: categoryName,
          reason: 'Missing heading'
        })
        return
      }
      if (!categoryName) {
        errors.push({
          row: rowNum,
          heading: headingName,
          category: '',
          reason: 'Missing category'
        })
        return
      }
      if (!type || !VALID_CATEGORY_TYPES.includes(type as CategoryExportRow['type'])) {
        errors.push({
          row: rowNum,
          heading: headingName,
          category: categoryName,
          reason: `Invalid type "${raw.type ?? ''}" — must be expense, income or transfer`
        })
        return
      }

      const headingKey = headingName.toLowerCase()
      let heading = headingByName.get(headingKey)
      if (!heading) {
        maxHeadingOrder += 1
        heading = insertHeading.get(headingName, maxHeadingOrder) as Heading
        headingByName.set(headingKey, heading)
        headingsCreated += 1
      }

      const dupKey = categoryKey(heading.id, categoryName)
      if (existingKeys.has(dupKey)) {
        duplicates += 1
        return
      }

      const nextOrder = (nextCategoryOrder.get(heading.id) ?? -1) + 1
      nextCategoryOrder.set(heading.id, nextOrder)
      insertCategory.run(heading.id, categoryName, type, nextOrder)
      existingKeys.add(dupKey)
      categoriesCreated += 1
    })
  })

  txn(rows)

  return {
    headingsCreated,
    categoriesCreated,
    duplicates,
    errors,
    totalRows: rows.length
  }
}
