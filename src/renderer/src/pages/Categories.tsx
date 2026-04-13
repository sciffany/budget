import { useEffect, useState } from "react";
import type { Category, Heading, NewCategory, NewHeading } from "@shared/types";
import { cn } from "../lib/utils";

export default function Categories(): JSX.Element {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingHeading, setEditingHeading] = useState<number | "new" | null>(
    null
  );
  const [editingCategory, setEditingCategory] = useState<number | "new" | null>(
    null
  );
  const [newHeadingName, setNewHeadingName] = useState("");
  const [newCat, setNewCat] = useState<NewCategory>({
    heading_id: 0,
    name: "",
    type: "expense",
  });

  async function load(): Promise<void> {
    const [h, c] = await Promise.all([
      window.api.listHeadings(),
      window.api.listCategories(),
    ]);
    setHeadings(h);
    setCategories(c);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveHeading(): Promise<void> {
    if (!newHeadingName.trim()) return;
    if (editingHeading === "new") {
      await window.api.createHeading({ name: newHeadingName.trim() });
    } else if (typeof editingHeading === "number") {
      await window.api.updateHeading(editingHeading, {
        name: newHeadingName.trim(),
      });
    }
    setEditingHeading(null);
    setNewHeadingName("");
    load();
  }

  async function deleteHeading(id: number): Promise<void> {
    await window.api.deleteHeading(id);
    load();
  }

  async function saveCategory(): Promise<void> {
    if (!newCat.name.trim() || !newCat.heading_id) return;
    if (editingCategory === "new") {
      await window.api.createCategory(newCat);
    } else if (typeof editingCategory === "number") {
      await window.api.updateCategory(editingCategory, newCat);
    }
    setEditingCategory(null);
    setNewCat({ heading_id: 0, name: "", type: "expense" });
    load();
  }

  async function deleteCategory(id: number): Promise<void> {
    await window.api.deleteCategory(id);
    load();
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Categories</h1>
        <button
          onClick={() => {
            setEditingHeading("new");
            setNewHeadingName("");
          }}
          className="text-sm px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 transition-colors"
        >
          + Add Heading
        </button>
      </div>

      <div className="p-6 space-y-6">
        {headings.map((h) => {
          const cats = categories.filter((c) => c.heading_id === h.id);
          return (
            <div
              key={h.id}
              className="rounded-lg border border-border overflow-hidden"
            >
              {/* Heading row */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-card">
                {editingHeading === h.id ? (
                  <input
                    autoFocus
                    className="bg-transparent border-b border-primary text-sm outline-none flex-1 mr-4"
                    value={newHeadingName}
                    onChange={(e) => setNewHeadingName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveHeading()}
                  />
                ) : (
                  <span className="font-medium text-sm">{h.name}</span>
                )}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {editingHeading === h.id ? (
                    <>
                      <button
                        onClick={saveHeading}
                        className="hover:text-foreground"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingHeading(null)}
                        className="hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingHeading(h.id);
                          setNewHeadingName(h.name);
                        }}
                        className="hover:text-foreground"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteHeading(h.id)}
                        className="hover:text-destructive-foreground text-destructive/60"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setEditingCategory("new");
                      setNewCat({
                        heading_id: h.id,
                        name: "",
                        type: "expense",
                      });
                    }}
                    className="hover:text-foreground ml-2"
                  >
                    + Category
                  </button>
                </div>
              </div>

              {/* Categories */}
              <div className="divide-y divide-border/50">
                {cats.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span>{c.name}</span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          c.type === "income"
                            ? "bg-emerald-900/40 text-emerald-400"
                            : c.type === "transfer"
                              ? "bg-blue-900/40 text-blue-400"
                              : "bg-accent text-muted-foreground"
                        )}
                      >
                        {c.type}
                      </span>
                      {c.protected === 1 && (
                        <span className="text-xs text-muted-foreground/50">
                          protected
                        </span>
                      )}
                    </div>
                    {c.protected === 0 && (
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <button
                          onClick={() => {
                            setEditingCategory(c.id);
                            setNewCat({
                              heading_id: c.heading_id,
                              name: c.name,
                              type: c.type,
                            });
                          }}
                          className="hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCategory(c.id)}
                          className="hover:text-destructive-foreground text-destructive/60"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* New category inline form */}
                {editingCategory === "new" && newCat.heading_id === h.id && (
                  <div className="flex items-center gap-3 px-4 py-2 text-sm bg-accent/20">
                    <input
                      autoFocus
                      placeholder="Category name"
                      className="bg-transparent border-b border-primary outline-none flex-1 text-sm"
                      value={newCat.name}
                      onChange={(e) =>
                        setNewCat((c) => ({ ...c, name: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && saveCategory()}
                    />
                    <select
                      value={newCat.type}
                      onChange={(e) =>
                        setNewCat((c) => ({
                          ...c,
                          type: e.target.value as NewCategory["type"],
                        }))
                      }
                      className="bg-accent border border-border rounded px-1 py-0.5 text-xs"
                    >
                      <option value="expense">expense</option>
                      <option value="income">income</option>
                      <option value="transfer">transfer</option>
                    </select>
                    <button
                      onClick={saveCategory}
                      className="text-xs hover:text-foreground text-muted-foreground"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="text-xs hover:text-foreground text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Edit category inline form */}
                {typeof editingCategory === "number" &&
                  categories.find((c) => c.id === editingCategory)
                    ?.heading_id === h.id && (
                    <div className="flex items-center gap-3 px-4 py-2 text-sm bg-accent/20">
                      <input
                        autoFocus
                        className="bg-transparent border-b border-primary outline-none flex-1 text-sm"
                        value={newCat.name}
                        onChange={(e) =>
                          setNewCat((c) => ({ ...c, name: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && saveCategory()}
                      />
                      <select
                        value={newCat.type}
                        onChange={(e) =>
                          setNewCat((c) => ({
                            ...c,
                            type: e.target.value as NewCategory["type"],
                          }))
                        }
                        className="bg-accent border border-border rounded px-1 py-0.5 text-xs"
                      >
                        <option value="expense">expense</option>
                        <option value="income">income</option>
                        <option value="transfer">transfer</option>
                      </select>
                      <button
                        onClick={saveCategory}
                        className="text-xs hover:text-foreground text-muted-foreground"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCategory(null)}
                        className="text-xs hover:text-foreground text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
              </div>
            </div>
          );
        })}

        {/* New heading inline form */}
        {editingHeading === "new" && (
          <div className="rounded-lg border border-primary/40 px-4 py-3 flex items-center gap-3">
            <input
              autoFocus
              placeholder="Heading name"
              className="bg-transparent border-b border-primary outline-none flex-1 text-sm"
              value={newHeadingName}
              onChange={(e) => setNewHeadingName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveHeading()}
            />
            <button
              onClick={saveHeading}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Save
            </button>
            <button
              onClick={() => setEditingHeading(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {headings.length === 0 && editingHeading !== "new" && (
          <div className="text-center text-sm text-muted-foreground py-16">
            No headings yet — click "Add Heading" to create your first group
          </div>
        )}
      </div>
    </div>
  );
}
