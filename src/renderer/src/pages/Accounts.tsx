import { useEffect, useState } from "react";
import type { Account, NewAccount } from "@shared/types";
import { cn } from "../lib/utils";

const ACCOUNT_TYPES: Account["type"][] = [
  "checking",
  "savings",
  "credit",
  "ewallet",
];

const TYPE_LABELS: Record<Account["type"], string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit card",
  ewallet: "E-wallet",
};

const BLANK: NewAccount = {
  name: "",
  institution: "",
  type: "checking",
  currency: "SGD",
};

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<NewAccount>(BLANK);
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    setAccounts(await window.api.listAccounts());
  }

  useEffect(() => {
    load();
  }, []);

  function openNew(): void {
    setForm(BLANK);
    setEditing("new");
  }

  function openEdit(a: Account): void {
    setForm({
      name: a.name,
      institution: a.institution,
      type: a.type,
      currency: a.currency,
    });
    setEditing(a.id);
  }

  function cancel(): void {
    setEditing(null);
    setForm(BLANK);
  }

  async function save(): Promise<void> {
    if (!form.name.trim() || !form.institution.trim()) return;
    setSaving(true);
    if (editing === "new") {
      await window.api.createAccount(form);
    } else if (typeof editing === "number") {
      await window.api.updateAccount(editing, form);
    }
    setSaving(false);
    setEditing(null);
    setForm(BLANK);
    load();
  }

  async function remove(id: number): Promise<void> {
    await window.api.deleteAccount(id);
    load();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Accounts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bank accounts and e-wallets used for importing
          </p>
        </div>
        <button
          onClick={openNew}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Add account
        </button>
      </div>

      {/* Add / edit form */}
      {editing !== null && (
        <div className="mx-6 mt-4 p-4 rounded-lg border border-border bg-accent/20">
          <p className="text-sm font-medium mb-3">
            {editing === "new" ? "New account" : "Edit account"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. DBS Debit"
                className="text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                Institution
              </label>
              <input
                value={form.institution}
                onChange={(e) =>
                  setForm((f) => ({ ...f, institution: e.target.value }))
                }
                placeholder="e.g. DBS"
                className="text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as Account["type"],
                  }))
                }
                className="text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Currency</label>
              <input
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    currency: e.target.value.toUpperCase(),
                  }))
                }
                maxLength={3}
                placeholder="SGD"
                className="text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary uppercase"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              disabled={saving || !form.name.trim() || !form.institution.trim()}
              onClick={save}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Account list */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {accounts.length === 0 && editing === null ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm">No accounts yet.</p>
            <p className="text-xs">
              Add an account to start importing transactions.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-accent/10 hover:bg-accent/20 transition-colors",
                  editing === a.id && "ring-1 ring-primary"
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.institution} · {TYPE_LABELS[a.type]} · {a.currency}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(a)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
