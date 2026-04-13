import { useEffect, useState } from 'react'
import type { Category, NewRule, Rule, RuleDiffRow } from '@shared/types'
import { formatAmount, cn } from '../lib/utils'

interface Props {
  onNavigateToRules: () => void
  prefilledKeyword?: string
}

export default function Rules({ prefilledKeyword }: Props): JSX.Element {
  const [rules, setRules] = useState<Rule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<NewRule>({ category_id: 0, keyword: '', amount_min: null, amount_max: null })
  const [diff, setDiff] = useState<RuleDiffRow[] | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  async function load(openWithKeyword?: string): Promise<void> {
    const [r, c] = await Promise.all([window.api.listRules(), window.api.listCategories()])
    setRules(r)
    const filtered = c.filter((c) => c.protected === 0)
    setCategories(filtered)
    const defaultCategoryId = filtered[0]?.id ?? 0
    if (openWithKeyword !== undefined) {
      setForm({ category_id: defaultCategoryId, keyword: openWithKeyword, amount_min: null, amount_max: null })
      setEditingId('new')
    } else if (form.category_id === 0 && filtered.length > 0) {
      setForm((f) => ({ ...f, category_id: defaultCategoryId }))
    }
  }

  useEffect(() => { load(prefilledKeyword) }, [prefilledKeyword])

  async function save(): Promise<void> {
    if (!form.keyword.trim() || !form.category_id) return
    if (editingId === 'new') {
      await window.api.createRule(form)
    } else if (typeof editingId === 'number') {
      await window.api.updateRule(editingId, form)
    }
    setEditingId(null)
    load()
  }

  async function deleteRule(id: number): Promise<void> {
    await window.api.deleteRule(id)
    load()
  }

  async function openPreview(): Promise<void> {
    const d = await window.api.previewRules()
    setDiff(d)
    setPreviewOpen(true)
  }

  async function applyRules(): Promise<void> {
    setApplying(true)
    await window.api.applyRules()
    setApplying(false)
    setPreviewOpen(false)
    setDiff(null)
  }

  const categoryName = (id: number): string =>
    categories.find((c) => c.id === id)?.name ?? '?'

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Rules</h1>
        <div className="flex gap-2">
          <button
            onClick={openPreview}
            className="text-sm px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 transition-colors"
          >
            Run Rules
          </button>
          <button
            onClick={() => {
              setEditingId('new')
              setForm({ category_id: categories[0]?.id ?? 0, keyword: '', amount_min: null, amount_max: null })
            }}
            className="text-sm px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 transition-colors"
          >
            + New Rule
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-2">
        {editingId === 'new' && (
          <RuleForm
            form={form}
            categories={categories}
            onChange={setForm}
            onSave={save}
            onCancel={() => setEditingId(null)}
          />
        )}

        {rules.length === 0 && editingId !== 'new' ? (
          <div className="text-center text-sm text-muted-foreground py-16">
            No rules yet — create a rule to auto-categorize transactions
          </div>
        ) : (
          rules.map((rule, i) => (
            <div key={rule.id}>
              {editingId === rule.id ? (
                <RuleForm
                  form={form}
                  categories={categories}
                  onChange={setForm}
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-card text-sm">
                  <span className="text-muted-foreground tabular-nums w-5">{i + 1}</span>
                  <code className="flex-1 font-mono text-xs bg-accent/50 px-2 py-0.5 rounded">
                    {rule.keyword}
                  </code>
                  {(rule.amount_min !== null || rule.amount_max !== null) && (
                    <span className="text-xs text-muted-foreground">
                      {rule.amount_min !== null ? formatAmount(rule.amount_min) : '–'} →{' '}
                      {rule.amount_max !== null ? formatAmount(rule.amount_max) : '∞'}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
                    {categoryName(rule.category_id)}
                  </span>
                  <div className="flex gap-2 text-xs text-muted-foreground ml-auto">
                    <button
                      onClick={() => { setEditingId(rule.id); setForm({ category_id: rule.category_id, keyword: rule.keyword, amount_min: rule.amount_min, amount_max: rule.amount_max }) }}
                      className="hover:text-foreground"
                    >Edit</button>
                    <button onClick={() => deleteRule(rule.id)} className="hover:text-destructive-foreground text-destructive/60">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Run Rules Preview Modal */}
      {previewOpen && diff !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">Run Rules — Preview</h2>
              <span className="text-sm text-muted-foreground">{diff.length} changes</span>
            </div>
            <div className="flex-1 overflow-auto">
              {diff.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  All transactions already categorised correctly
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">Payee</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Current</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((row) => (
                      <tr key={row.transactionId} className="border-b border-border/50">
                        <td className="px-4 py-2 max-w-xs truncate">{row.payee}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.currentCategoryName}</td>
                        <td className="px-3 py-2 text-primary">{row.newCategoryName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <button
                onClick={() => setPreviewOpen(false)}
                className="px-4 py-1.5 rounded-md bg-accent text-sm hover:bg-accent/80"
              >
                Cancel
              </button>
              <button
                disabled={applying || diff.length === 0}
                onClick={applyRules}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
              >
                {applying ? 'Applying…' : `Apply ${diff.length} changes`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RuleForm({
  form,
  categories,
  onChange,
  onSave,
  onCancel,
}: {
  form: NewRule
  categories: Category[]
  onChange: (f: NewRule) => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/40 bg-card/50 text-sm">
      <input
        autoFocus
        placeholder="keyword (substring match)"
        className="flex-1 bg-transparent border-b border-primary outline-none font-mono text-xs"
        value={form.keyword}
        onChange={(e) => onChange({ ...form, keyword: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSave()}
      />
      <select
        value={form.category_id}
        onChange={(e) => onChange({ ...form, category_id: Number(e.target.value) })}
        className="bg-accent border border-border rounded px-2 py-0.5 text-xs"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        type="number"
        placeholder="min"
        className="w-20 bg-transparent border-b border-border outline-none text-xs"
        value={form.amount_min ?? ''}
        onChange={(e) => onChange({ ...form, amount_min: e.target.value ? Number(e.target.value) : null })}
      />
      <input
        type="number"
        placeholder="max"
        className="w-20 bg-transparent border-b border-border outline-none text-xs"
        value={form.amount_max ?? ''}
        onChange={(e) => onChange({ ...form, amount_max: e.target.value ? Number(e.target.value) : null })}
      />
      <button onClick={onSave} className="text-xs text-muted-foreground hover:text-foreground">Save</button>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  )
}
