import { getDb } from '../schema'
import type { Category, Heading, NewCategory, NewHeading } from '@shared/types'

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
