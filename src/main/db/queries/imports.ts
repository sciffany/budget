import { getDb } from '../schema'
import type { Import } from '@shared/types'

export function listImports(): Import[] {
  return getDb()
    .prepare('SELECT * FROM imports ORDER BY imported_at DESC')
    .all() as Import[]
}

export function createImport(data: Omit<Import, 'id'>): Import {
  return getDb()
    .prepare(
      'INSERT INTO imports (filename, bank_type, format, imported_at, transaction_count) VALUES (?, ?, ?, ?, ?) RETURNING *'
    )
    .get(
      data.filename,
      data.bank_type,
      data.format,
      data.imported_at,
      data.transaction_count
    ) as Import
}
