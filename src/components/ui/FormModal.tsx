import { useState, type ReactNode } from "react";
import { useSubmit } from "../../lib/useAsync";
import { Button } from "./Button";
import { Alert, ConfirmModal, FormFields, Modal, setField, type FieldDef, type FormValues } from "./kit";

/** A dialog with a form. `onSave` receives the values; throw (or let the API throw) to show the message in the dialog. */
export function FormModal({ title, fields, initial, onSave, onClose, onDelete, deleteText, saveLabel = "Save", wide, extra }: {
  title: string; fields: FieldDef[]; initial: FormValues; onSave: (values: FormValues) => Promise<void>; onClose: () => void;
  onDelete?: () => Promise<void>; deleteText?: string; saveLabel?: string; wide?: boolean; extra?: ReactNode;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [confirming, setConfirming] = useState(false);
  const { busy, error, setError, run } = useSubmit();
  const change = setField(setValues);
  return <>
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={(event) => { event.preventDefault(); setError(null); void run(async () => { await onSave(values); onClose(); }); }}>
        <FormFields fields={fields} values={values} onChange={change} />
        {extra}
        {error && !confirming && <Alert tone="error">{error}</Alert>}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <div>{onDelete && <Button type="button" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => { setError(null); setConfirming(true); }}>Delete</Button>}</div>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : saveLabel}</Button></div>
        </div>
      </form>
    </Modal>
    {confirming && onDelete && <ConfirmModal title="Delete this item?" text={deleteText ?? "This cannot be undone."} confirmLabel="Delete" danger busy={busy} error={error} onClose={() => setConfirming(false)} onConfirm={() => void run(async () => { await onDelete(); setConfirming(false); onClose(); })} />}
  </>;
}
