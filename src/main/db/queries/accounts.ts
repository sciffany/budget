import { getDb } from '../schema'
import type { Account, NewAccount } from '@shared/types'

export function listAccounts(): Account[] {
  return getDb().prepare('SELECT * FROM accounts ORDER BY name').all() as Account[]
}

export function getAccount(id: number): Account | undefined {
  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined
}

export function createAccount(data: NewAccount): Account {
  const db = getDb()
  const result = db
    .prepare(
      'INSERT INTO accounts (name, institution, type, currency) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .get(data.name, data.institution, data.type, data.currency) as Account
  return result
}

export function updateAccount(id: number, data: NewAccount): Account {
  const db = getDb()
  const result = db
    .prepare(
      'UPDATE accounts SET name=?, institution=?, type=?, currency=? WHERE id=? RETURNING *'
    )
    .get(data.name, data.institution, data.type, data.currency, id) as Account
  return result
}

export function deleteAccount(id: number): void {
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id)
}
