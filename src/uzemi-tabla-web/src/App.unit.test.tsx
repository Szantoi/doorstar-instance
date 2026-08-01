import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

const routeModules = vi.hoisted(() => {
  let resolveOffice!: () => void;
  let resolveShopFloor!: () => void;
  const office = new Promise<void>((resolve) => { resolveOffice = resolve; });
  const shopFloor = new Promise<void>((resolve) => { resolveShopFloor = resolve; });
  return { office, shopFloor, resolveOffice, resolveShopFloor };
});

vi.mock("@/services/production/hooks", () => ({
  useStations: () => ({ data: { stations: [] } }),
}));

vi.mock("./pages/production/HomePage", async () => {
  await routeModules.office;
  return { HomePage: () => <main>Irodai oldal betöltve</main> };
});

vi.mock("./pages/production/BoardPage", async () => {
  await routeModules.shopFloor;
  return { BoardPage: () => <main>Üzemi oldal betöltve</main> };
});

afterEach(cleanup);

describe("App lazy leaf routes", () => {
  it("keeps the office shell visible until its lazy route resolves", async () => {
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Doorstar" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Irodai navigáció" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Oldal betöltése…");
    expect(screen.queryByText("Irodai oldal betöltve")).not.toBeInTheDocument();

    await act(async () => { routeModules.resolveOffice(); });

    expect(await screen.findByText("Irodai oldal betöltve")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the shop-floor shell visible until its lazy route resolves", async () => {
    render(<MemoryRouter initialEntries={["/board"]}><App /></MemoryRouter>);

    expect(screen.getByText("Üzemi tábla")).toBeVisible();
    expect(screen.getByRole("link", { name: "Tábla" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("Üzemi oldal betöltve")).not.toBeInTheDocument();

    await act(async () => { routeModules.resolveShopFloor(); });

    expect(await screen.findByText("Üzemi oldal betöltve")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
