// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CreateInput } from "@/features/projects/components/file-explorer/create-input";
import { RenameInput } from "@/features/projects/components/file-explorer/rename-input";

describe("CreateInput duplicate submission guards", () => {
  it("submits exactly once when pressing Enter followed by blur", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateInput
        type="file"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "test.ts" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("test.ts");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits exactly once when Enter is rapidly pressed multiple times", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateInput
        type="folder"
        level={1}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "components" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("components");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels exactly once and does not submit when Escape is followed by blur", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateInput
        type="file"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "abandoned.ts" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
      fireEvent.blur(input);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel exactly once when submitted empty or whitespace only", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateInput
        type="file"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "   " } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("submits on blur when no Enter was pressed", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateInput
        type="file"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "valid-name.txt" } });
      fireEvent.blur(input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("valid-name.txt");
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("RenameInput duplicate submission guards", () => {
  it("submits rename exactly once when pressing Enter followed by blur", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RenameInput
        type="file"
        defaultValue="old-name.ts"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "new-name.ts" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("new-name.ts");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits rename exactly once when Enter is rapidly pressed multiple times", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RenameInput
        type="folder"
        defaultValue="src"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "source" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("source");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels rename exactly once and ignores subsequent blur on Escape", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RenameInput
        type="file"
        defaultValue="unchanged.ts"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "cancelled-change.ts" } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
      fireEvent.blur(input);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("falls back to defaultValue when whitespace is submitted", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RenameInput
        type="file"
        defaultValue="original.txt"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "    " } });
    });

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.blur(input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("original.txt");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits on blur when no Enter was pressed", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RenameInput
        type="file"
        defaultValue="file.js"
        level={0}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole("textbox");

    act(() => {
      fireEvent.change(input, { target: { value: "renamed.js" } });
      fireEvent.blur(input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("renamed.js");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
