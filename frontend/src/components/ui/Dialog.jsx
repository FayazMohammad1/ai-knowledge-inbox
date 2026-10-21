export function Dialog({ title, children, onClose, actions }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/45 p-4" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="m-0 text-lg font-bold text-[#020202]">{title}</h2>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="text-2xl leading-none text-[#515051] hover:text-[#020202]">×</button>
        </div>
        <div className="mt-3 text-sm text-[#515051]">{children}</div>
        {actions && <div className="mt-6 flex justify-end gap-3">{actions}</div>}
      </section>
    </div>
  );
}
