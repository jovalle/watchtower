import { useEffect, useRef } from "react";
import { Button, buttonStyles } from "~/components/ui";

type CreateRoomDialogProps = {
  title: string;
  resumePositionMs: number;
  pending: boolean;
  disabled: boolean;
  disabledReason: string | null;
  error: string | null;
  onCreate(startPositionMs: number): void;
  onCancel(): void;
};

export function CreateRoomDialog({
  title,
  resumePositionMs,
  pending,
  disabled,
  disabledReason,
  error,
  onCreate,
  onCancel,
}: CreateRoomDialogProps) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) submittedRef.current = false;
  }, [error]);

  const create = (positionMs: number) => {
    if (pending || disabled || submittedRef.current) return;
    submittedRef.current = true;
    onCreate(positionMs);
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border-emphasis bg-background-elevated p-6 text-foreground-primary shadow-2xl">
        <h2 id="create-room-title" className="text-xl font-semibold">
          Watch together
        </h2>
        <p className="mt-2 text-sm text-foreground-secondary">{title}</p>
        {disabledReason && (
          <p className="mt-4 rounded border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
            {disabledReason}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-3">
          <button
            ref={firstButtonRef}
            type="button"
            disabled={pending || disabled}
            onClick={() => create(0)}
            className={buttonStyles()}
          >
            {pending ? "Creating room..." : "Start from beginning"}
          </button>
          {resumePositionMs > 0 && (
            <Button
              variant="secondary"
              type="button"
              disabled={pending || disabled}
              onClick={() => create(resumePositionMs)}
            >
              Start from saved position
            </Button>
          )}
          <Button
            variant="ghost"
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}