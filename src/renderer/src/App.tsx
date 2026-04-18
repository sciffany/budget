import { useState } from "react";
import type { TransactionFilter } from "@shared/types";
import { cn } from "./lib/utils";
import Transactions from "./pages/Transactions";
import Import from "./pages/Import";
import Accounts from "./pages/Accounts";
import Categories from "./pages/Categories";
import Rules from "./pages/Rules";
import Reports from "./pages/Reports";

type Page =
  | "transactions"
  | "import"
  | "accounts"
  | "categories"
  | "rules"
  | "reports";

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "transactions", label: "Transactions", icon: "$" },
  { id: "import", label: "Import", icon: "↑" },
  { id: "accounts", label: "Accounts", icon: "◈" },
  { id: "categories", label: "Categories", icon: "⊞" },
  { id: "rules", label: "Rules", icon: "⚙" },
  { id: "reports", label: "Reports", icon: "◫" },
];

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>("transactions");
  const [pendingRuleKeyword, setPendingRuleKeyword] = useState<
    string | undefined
  >(undefined);
  const [pendingTxFilter, setPendingTxFilter] = useState<
    TransactionFilter | undefined
  >(undefined);
  const [txInstance, setTxInstance] = useState(0);

  function handleCreateRule(payee: string): void {
    setPendingRuleKeyword(payee);
    setPage("rules");
  }

  function handleDrillDown(filter: TransactionFilter): void {
    setPendingTxFilter(filter);
    setTxInstance((n) => n + 1);
    setPage("transactions");
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <nav className="w-48 flex-shrink-0 border-r border-border flex flex-col pt-10 pb-4 gap-1 px-2">
        <div className="px-3 mb-4">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Budget
          </span>
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setPage(item.id);
              setPendingRuleKeyword(undefined);
              setPendingTxFilter(undefined);
            }}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
              page === item.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <span className="w-4 text-center leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {page === "transactions" && (
          <Transactions
            onCreateRule={handleCreateRule}
            initialFilter={pendingTxFilter}
            key={`tx-${txInstance}`}
          />
        )}
        {page === "import" && <Import />}
        {page === "accounts" && <Accounts />}
        {page === "categories" && <Categories />}
        {page === "rules" && (
          <Rules
            onNavigateToRules={() => setPage("rules")}
            prefilledKeyword={pendingRuleKeyword}
            key={pendingRuleKeyword ?? "rules"}
          />
        )}
        {page === "reports" && <Reports onDrillDown={handleDrillDown} />}
      </main>
    </div>
  );
}
