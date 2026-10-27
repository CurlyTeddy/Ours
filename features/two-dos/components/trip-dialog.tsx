"use client";

import { useState, useTransition } from "react";
import {
  BoardModal,
  fieldClass,
  ghostButton,
  labelClass,
  primaryButton,
} from "@/features/two-dos/components/board-modal";
import { tripSaveSchema } from "@/features/two-dos/models/trip";
import type { TripFields } from "@/features/two-dos/hooks/use-todo-moves";

function FieldError({
  error,
  field,
}: {
  error: { field: PropertyKey; message: string } | null;
  field: string;
}) {
  return error?.field === field ? (
    <span role="alert" className="text-[12.5px] font-extrabold text-us-danger">
      {error.message}
    </span>
  ) : null;
}

// New trip, or Edit trip when initial is given. onSave resolves false to keep the dialog open.
function TripDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: TripFields;
  onSave: (fields: TripFields) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    start: initial?.startDate ?? "",
    end: initial?.endDate ?? "",
  });
  // field is the schema key the issue is on, so the message sits under that input
  const [error, setError] = useState<{
    field: PropertyKey;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const title = initial ? "Edit trip" : "New trip";
  const blank = form.name.trim() === "";

  const save = () => {
    if (blank || isPending) return;
    const parsed = tripSaveSchema.safeParse({
      name: form.name,
      startDate: form.start || null,
      endDate: form.end || null,
    });
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      setError({ field: issue.path[0], message: issue.message });
      return;
    }
    startTransition(async () => {
      if (await onSave(parsed.data)) onClose();
    });
  };

  const edit = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };

  return (
    <BoardModal label={title} onClose={onClose}>
      <h3 className="text-[22px] font-black">{title}</h3>
      <form
        noValidate
        className="flex flex-col gap-4.5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="trip-name">
            Name
          </label>
          <input
            id="trip-name"
            type="text"
            value={form.name}
            maxLength={80}
            autoFocus
            placeholder="e.g. Kyoto in spring 2027"
            onChange={(event) => edit({ name: event.target.value })}
            className={fieldClass}
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-[1_1_160px] flex-col gap-2">
            <label className={labelClass} htmlFor="trip-start">
              From
            </label>
            <input
              id="trip-start"
              type="date"
              value={form.start}
              onChange={(event) => edit({ start: event.target.value })}
              className={fieldClass}
            />
            <FieldError error={error} field="startDate" />
          </div>
          <div className="flex flex-[1_1_160px] flex-col gap-2">
            <label className={labelClass} htmlFor="trip-end">
              To
            </label>
            <input
              id="trip-end"
              type="date"
              value={form.end}
              onChange={(event) => edit({ end: event.target.value })}
              className={fieldClass}
            />
            <FieldError error={error} field="endDate" />
          </div>
        </div>
        <span className="-mt-2 text-[12.5px] font-bold text-us-muted">
          Dates are optional — leave them empty while it is still a plan.
        </span>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostButton}>
            Cancel
          </button>
          <button
            type="submit"
            aria-disabled={blank || isPending}
            className={primaryButton}
          >
            {initial ? "Save" : "Create trip"}
          </button>
        </div>
      </form>
    </BoardModal>
  );
}

export { TripDialog };
