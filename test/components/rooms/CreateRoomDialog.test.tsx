import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CreateRoomDialog } from "~/components/rooms";

it("allows one create submission while the stable request is pending", () => {
  const create = vi.fn();
  const { rerender } = render(
    <CreateRoomDialog
      title="Example"
      resumePositionMs={42_000}
      pending={false}
      disabled={false}
      disabledReason={null}
      error={null}
      onCreate={create}
      onCancel={() => {}}
    />
  );
  const createButton = screen.getByRole("button", { name: "Start from Beginning" });
  fireEvent.click(createButton);
  fireEvent.click(createButton);
  rerender(
    <CreateRoomDialog
      title="Example"
      resumePositionMs={42_000}
      pending
      disabled={false}
      disabledReason={null}
      error={null}
      onCreate={create}
      onCancel={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Creating Room..." }));
  expect(create).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledWith(0);
});
it("contains focus and supports Escape while creation is available", () => {
  const cancel = vi.fn();
  render(<CreateRoomDialog title="Example" resumePositionMs={0} pending={false} disabled={false} disabledReason={null} error={null} onCreate={() => {}} onCancel={cancel} />);
  const start = screen.getByRole("button", { name: "Start from Beginning" });
  const cancelButton = screen.getByRole("button", { name: "Cancel" });
  cancelButton.focus();
  fireEvent.keyDown(cancelButton, { key: "Tab" });
  expect(start).toHaveFocus();
  fireEvent.keyDown(start, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
});
