import { useEffect, useState } from "react";
import { api, describeError } from "../api/client.js";
import StatusBadge from "./StatusBadge.jsx";
import { Button } from "./ui/Button.jsx";
import { Dialog } from "./ui/Dialog.jsx";

function Item({ item, onDelete, onRequestDelete, onOpen }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(item.id);
    } catch (err) {
      setDeleteError(describeError(err));
      setDeleting(false);
    }
  };

  return (
    <li className="item" onClick={() => onOpen(item)}>
      <div className="item-head">
        <button
          type="button"
          className="item-title item-open"
          onClick={() => onOpen(item)}
        >
          {item.title}
        </button>
        <StatusBadge status={item.status} />
      </div>

      <p className="meta">
        {item.sourceType === "url" ? "URL" : "Note"} ·{" "}
        {new Date(item.createdAt).toLocaleString()}
        {item.status === "ready" &&
          ` · ${item.chunkCount} chunk${item.chunkCount === 1 ? "" : "s"}`}
      </p>

      {item.preview && <p className="preview">{item.preview}</p>}
      {item.status === "failed" && item.error && (
        <p className="error">{item.error}</p>
      )}
      {deleteError && <p className="error">{deleteError}</p>}

      <Button
        type="button"
        variant="danger"
        className="mt-3"
        aria-label={`Delete ${item.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onRequestDelete({ item, handleDelete });
        }}
        disabled={deleting}
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </li>
  );
}

export default function ItemList({ items, loading, error, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const visibleItems = items.filter(
    (item) => filter === "all" || item.sourceType === filter,
  );

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();
    setDetail(null);
    setDetailError(null);
    api
      .getItem(selected.id, controller.signal)
      .then(({ item }) => setDetail(item))
      .catch((err) => {
        if (err.name !== "AbortError") setDetailError(err);
      });
    const closeOnEscape = (event) =>
      event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => {
      controller.abort();
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("modal-open");
    };
  }, [selected]);

  return (
    <section className="card" aria-labelledby="items-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your library</p>
          <h2 id="items-heading">
            Saved items <span className="count">{visibleItems.length}</span>
          </h2>
        </div>
        <div className="filters" role="group" aria-label="Filter saved items">
          {["all", "note", "url"].map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "filter-active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "note" ? "Notes" : "URLs"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          Could not load items: {describeError(error)}
        </p>
      )}
      {loading && <p className="hint">Loading…</p>}
      {!loading && !error && visibleItems.length === 0 && (
        <p className="hint">
          {items.length
            ? "No items match this filter."
            : "Nothing saved yet. Add a note or a URL above."}
        </p>
      )}

      <ul className="items">
        {visibleItems.map((item) => (
          <Item
            key={item.id}
            item={item}
            onDelete={onDelete}
            onRequestDelete={(request) => {
              setSelected(null);
              setPendingDelete(request);
            }}
            onOpen={setSelected}
          />
        ))}
      </ul>
      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <article
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close item"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <p className="eyebrow">
              {selected.sourceType === "url" ? "Web page" : "Note"}
            </p>
            <h2 id="item-dialog-title">{detail?.title ?? selected.title}</h2>
            <p className="meta">
              {new Date(selected.createdAt).toLocaleString()}
            </p>
            {detail?.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="modal-url"
              >
                {detail.sourceUrl}
              </a>
            )}
            {detailError ? (
              <p className="error">{describeError(detailError)}</p>
            ) : (
              <div className="modal-content">
                {detail ? detail.rawContent : "Loading content…"}
              </div>
            )}
          </article>
        </div>
      )}
      {pendingDelete && (
        <Dialog
          title="Delete saved item?"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await pendingDelete.handleDelete();
                  setPendingDelete(null);
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          This will permanently remove “{pendingDelete.item.title}” from your inbox.
        </Dialog>
      )}
    </section>
  );
}
