import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error The frontend tsconfig intentionally excludes Node globals; Vitest still runs in Node.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductShell } from "./ProductShell";

const css = readFileSync("src/index.css", "utf8") as string;

type MediaListenerMethods = Partial<Pick<MediaQueryList, "addEventListener" | "removeEventListener" | "addListener" | "removeListener">>;

function setPhoneMode(matches: boolean, listenerMethods: MediaListenerMethods = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}) {
  const query = {
    matches,
    media: "(max-width: 620px)",
    onchange: null,
    dispatchEvent: () => true,
    ...listenerMethods,
  } as MediaQueryList;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => query,
  });
}

function renderShell(path = "/", phone = false, listenerMethods?: MediaListenerMethods) {
  setPhoneMode(phone, listenerMethods);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProductShell />}>
          <Route path="*" element={<main>Irodai tartalom</main>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProductShell responsive office modes", () => {
  beforeEach(() => window.localStorage.removeItem("doorstar.product-theme"));
  afterEach(cleanup);

  it("uses only the modern matchMedia listener and removes the same callback", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const view = renderShell("/", false, { addEventListener, removeEventListener, addListener, removeListener });

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(addListener).not.toHaveBeenCalled();
    const callback = addEventListener.mock.calls[0][1];

    view.unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", callback);
    expect(removeListener).not.toHaveBeenCalled();
  });

  it("falls back exclusively to legacy matchMedia listeners and cleans them up", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const view = renderShell("/", false, { addListener, removeListener });

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith(expect.any(Function));
    const callback = addListener.mock.calls[0][0];

    view.unmount();

    expect(removeListener).toHaveBeenCalledWith(callback);
  });

  it("keeps the theme toggle operable and exposes the resulting theme", () => {
    const view = renderShell();
    const shell = view.container.querySelector(".doorstar-product-shell");
    const toggle = screen.getByRole("button", { name: "dark mód bekapcsolása" });

    expect(shell).toHaveAttribute("data-theme", "light");
    fireEvent.click(toggle);

    expect(shell).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "light mód bekapcsolása" })).toBeEnabled();
  });

  it.each([
    ["/", "Áttekintés"],
    ["/orders", "Rendelések"],
    ["/orders/new", "Sales"],
    ["/projects", "Projektek"],
    ["/imports", "Import Inbox"],
  ])("exposes exactly one current desktop route for %s", (path, label) => {
    const view = renderShell(path);
    const current = view.container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  it("leaves aria-current to the nested workspace on deep order and project routes", () => {
    const view = renderShell("/orders/DSMR-1");
    expect(view.container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Rendelések" })).toHaveClass("is-active");
  });

  it("uses the phone bottom navigation without activating Orders on the Sales route", () => {
    const view = renderShell("/orders/new", true);
    expect(screen.getByRole("navigation", { name: "Telefonos irodai navigáció" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Irodai navigáció" })).toBeNull();
    expect(view.container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Sales" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Rendelések" })).not.toHaveAttribute("aria-current");
  });

  it("opens and closes the phone More disclosure, exposes theme and role, and restores focus on Escape", () => {
    renderShell("/", true);
    const more = screen.getByRole("button", { name: "Továbbiak" });
    fireEvent.click(more);

    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "További irodai navigáció" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Import Inbox" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Üzemi tábla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "dark mód bekapcsolása" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Szerep" })).toBeEnabled();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "További irodai navigáció" })).toBeNull();
    expect(more).toHaveFocus();

    fireEvent.click(more);
    fireEvent.click(screen.getByRole("link", { name: "Import Inbox" }));
    expect(screen.queryByRole("navigation", { name: "További irodai navigáció" })).toBeNull();
  });

  it("moves the single current marker from More to the active panel link while disclosed", () => {
    const view = renderShell("/imports", true);
    const more = screen.getByRole("button", { name: "Továbbiak" });
    expect(more).toHaveAttribute("aria-current", "page");
    expect(view.container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    fireEvent.click(more);
    expect(more).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Import Inbox" })).toHaveAttribute("aria-current", "page");
    expect(view.container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("defines distinct tablet and phone layout contracts", () => {
    expect(css).toMatch(/\.doorstar-product-header\s*\{[^}]*flex:\s*none;/s);
    expect(css).toMatch(/@media \(min-width: 621px\) and \(max-width: 1023px\)[\s\S]*?\.doorstar-product-header\s*\{[^}]*flex-wrap:\s*wrap;/);
    expect(css).toMatch(/@media \(min-width: 621px\) and \(max-width: 1023px\)[\s\S]*?\.doorstar-product-nav\s*\{[^}]*overflow-x:\s*auto;/);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.doorstar-phone-nav\s*\{[^}]*position:\s*fixed;[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.doorstar-phone-nav\s[^}]*min-height:\s*48px;/);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.doorstar-product-shell\s*\{[^}]*padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/);
  });
});
