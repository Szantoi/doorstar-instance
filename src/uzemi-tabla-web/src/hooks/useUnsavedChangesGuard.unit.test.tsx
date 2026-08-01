import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { useConfirmStore } from "../store/confirmStore";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

const NativeRequest = globalThis.Request;

beforeAll(() => {
  globalThis.Request = class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const { signal: _signal, ...compatibleInit } = init ?? {};
      super(input, compatibleInit);
    }
  };
});

afterAll(() => {
  globalThis.Request = NativeRequest;
});

function GuardedDraft() {
  useUnsavedChangesGuard(true);
  return <Link to="/other">Másik oldal</Link>;
}

function renderGuardedDraft() {
  const router = createMemoryRouter([
    { path: "/", element: <GuardedDraft /> },
    { path: "/other", element: <p>Másik munkatér</p> },
  ], { initialEntries: ["/"] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  if (useConfirmStore.getState().message) useConfirmStore.getState().respond(false);
  cleanup();
});

describe("useUnsavedChangesGuard", () => {
  it("blocks internal navigation until the user explicitly leaves", async () => {
    const router = renderGuardedDraft();

    fireEvent.click(screen.getByRole("link", { name: "Másik oldal" }));
    await waitFor(() => expect(useConfirmStore.getState().message).toContain("Nem mentett"));
    expect(router.state.location.pathname).toBe("/");

    await act(async () => useConfirmStore.getState().respond(false));
    expect(router.state.location.pathname).toBe("/");

    fireEvent.click(screen.getByRole("link", { name: "Másik oldal" }));
    await waitFor(() => expect(useConfirmStore.getState().message).toContain("Nem mentett"));
    await act(async () => useConfirmStore.getState().respond(true));
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  it("marks browser refresh or close as cancelable while dirty", () => {
    renderGuardedDraft();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
