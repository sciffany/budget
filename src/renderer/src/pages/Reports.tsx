import { useEffect, useState } from 'react'
import type { ReportRow } from '@shared/types'
import { formatAmount, cn } from '../lib/utils'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'

export default function Reports(): JSX.Element {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [loading, setLoading] = useState(false)

  const dateFrom = format(month, 'yyyy-MM-dd')
  const dateTo = format(endOfMonth(month), 'yyyy-MM-dd')

  async function load(): Promise<void> {
    setLoading(true)
    const data = await window.api.reportSummary(dateFrom, dateTo)
    setRows(data as ReportRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [month])

  // Group by heading
  const byHeading = rows.reduce<Record<number, { headingName: string; rows: ReportRow[] }>>(
    (acc, row) => {
      if (!acc[row.headingId]) acc[row.headingId] = { headingName: row.headingName, rows: [] }
      acc[row.headingId].rows.push(row)
      return acc
    },
    {}
  )

  const totalExpense = rows.filter((r) => r.categoryType === 'expense').reduce((s, r) => s + r.net, 0)
  const totalIncome = rows.filter((r) => r.categoryType === 'income').reduce((s, r) => s + r.net, 0)
  const netFlow = totalIncome + totalExpense // expense is negative sum

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Reports</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-sm font-medium w-32 text-center tabular-nums">
            {format(month, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-6 px-6 py-4 border-b border-border/50 text-sm">
        <div>
          <p className="text-muted-foreground text-xs mb-1">Income</p>
          <p className="text-emerald-400 font-mono font-medium">{formatAmount(totalIncome)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Expenses</p>
          <p className="font-mono font-medium">{formatAmount(totalExpense)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Net</p>
          <p className={cn('font-mono font-medium', netFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {netFlow >= 0 ? '+' : ''}{formatAmount(netFlow)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? (
          <div className="text-center text-muted-foreground text-sm py-16">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            No transactions in this date range
          </div>
        ) : (
          Object.values(byHeading).map(({ headingName, rows: hRows }) => (
            <div key={headingName} className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-card flex items-center justify-between">
                <span className="font-medium text-sm">{headingName}</span>
                <span className="text-xs text-muted-foreground tabular-nums font-mono">
                  {formatAmount(hRows.reduce((s, r) => s + r.net, 0))}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {hRows.map((row) => (
                  <div key={row.categoryId} className="flex items-center px-4 py-2 text-sm">
                    <span className="flex-1">{row.categoryName}</span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full mr-4',
                      row.categoryType === 'income' ? 'bg-emerald-900/40 text-emerald-400' :
                      row.categoryType === 'transfer' ? 'bg-blue-900/40 text-blue-400' :
                      'bg-accent text-muted-foreground'
                    )}>{row.categoryType}</span>
                    <span className={cn(
                      'tabular-nums font-mono text-sm w-28 text-right',
                      row.net > 0 ? 'text-emerald-400' : ''
                    )}>
                      {row.net >= 0 ? '+' : ''}{formatAmount(row.net)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
