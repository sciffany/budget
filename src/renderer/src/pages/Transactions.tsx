import { useEffect, useRef, useState } from "react";
import type { Transaction, TransactionFilter } from "@shared/types";
import { formatAmount, formatDate } from "../lib/utils";
import { cn } from "../lib/utils";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

declare global {
  interface Window {
    api: import("../../../preload").Api;
  }
}

interface Props {
  onCreateRule: (payee: string) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  payee: string;
}

export default function Transactions({ onCreateRule }: Props): JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingDateId, setEditingDateId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchInput, 250);

  useEffect(() => {
    setFilter((f) => ({ ...f, search: debouncedSearch || undefined }));
  }, [debouncedSearch]);

  async function load(): Promise<void> {
    setLoading(true);
    const data = await window.api.listTransactions(filter);
    setTransactions(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [filter]);

  useEffect(() => {
    function handleClick(): void {
      setContextMenu(null);
    }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  function handleContextMenu(e: React.MouseEvent, payee: string): void {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, payee });
  }

  async function handleDateChange(id: number, newDate: string): Promise<void> {
    if (!newDate) return;
    await window.api.updateTransactionDate(id, newDate);
    setEditingDateId(null);
    await load();
  }

  function handleDateKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number
  ): void {
    if (e.key === "Enter") {
      handleDateChange(id, (e.currentTarget as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      setEditingDateId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold shrink-0">Transactions</h1>
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Search payees…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-accent/50 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground ml-auto shrink-0">
          <input
            type="checkbox"
            className="rounded"
            checked={!!filter.uncategorised}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                uncategorised: e.target.checked || undefined,
              }))
            }
          />
          Uncategorised only
        </label>
      </div>

      {/* Context menu */}
      {contextMenu !== null && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1 text-sm"
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors"
            onClick={() => {
              onCreateRule(contextMenu.payee);
              setContextMenu(null);
            }}
          >
            Create rule for payee…
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <span className="text-4xl">{searchInput ? "🔍" : "↑"}</span>
            <p className="text-sm">
              {searchInput
                ? `No transactions matching "${searchInput}"`
                : "No transactions yet — import a statement to get started"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr>
                <th className="text-left px-6 py-2 text-muted-foreground font-medium w-28">
                  Date
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Payee
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Account
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Category
                </th>
                <th className="text-right px-6 py-2 text-muted-foreground font-medium w-32">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onContextMenu={(e) => handleContextMenu(e, tx.payee)}
                  className={cn(
                    "border-b border-border/50 hover:bg-accent/30 transition-colors cursor-default",
                    tx.category_type === undefined && "bg-destructive/10"
                  )}
                >
                  <td
                    className="px-6 py-2 text-muted-foreground tabular-nums whitespace-nowrap"
                    onClick={() => {
                      setEditingDateId(tx.id);
                      setTimeout(() => dateInputRef.current?.focus(), 0);
                    }}
                  >
                    {editingDateId === tx.id ? (
                      <input
                        ref={dateInputRef}
                        type="date"
                        defaultValue={tx.date}
                        className="bg-background border border-ring rounded px-1 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        onBlur={(e) => handleDateChange(tx.id, e.target.value)}
                        onKeyDown={(e) => handleDateKeyDown(e, tx.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="cursor-pointer hover:text-foreground transition-colors">
                        {formatDate(tx.date)}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 max-w-xs truncate cursor-pointer hover:text-primary hover:underline underline-offset-2"
                    onClick={() => onCreateRule(tx.payee)}
                  >
                    {tx.payee}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {tx.account_name}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        tx.category_type === "income"
                          ? "bg-emerald-900/40 text-emerald-400"
                          : tx.category_type === "transfer"
                            ? "bg-blue-900/40 text-blue-400"
                            : "bg-accent text-muted-foreground"
                      )}
                    >
                      {tx.category_name}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-6 py-2 text-right tabular-nums font-mono text-sm",
                      tx.amount >= 0 ? "text-emerald-400" : "text-foreground"
                    )}
                  >
                    {tx.amount >= 0 ? "+" : "-"}
                    {formatAmount(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
