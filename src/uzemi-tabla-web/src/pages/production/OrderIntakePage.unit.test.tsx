import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useCreateSalesIntake } from "@/services/production/hooks";
import type { SalesIntakeInput } from "@/services/production/types";
import { useUiStore } from "@/store/uiStore";
import { OrderIntakePage } from "./OrderIntakePage";

vi.mock("@/services/production/hooks", () => ({ useCreateSalesIntake: vi.fn() }));

const mutateAsync = vi.fn(async (_input: SalesIntakeInput) => ({ id: "revision-test", revision: 1, status: "DRAFT", intakeStage: "SALES_DRAFT" }));

function renderPage() {
  return render(<MemoryRouter initialEntries={["/orders/new"]}>
    <Routes>
      <Route path="/orders/new" element={<OrderIntakePage />} />
      <Route path="/orders/:projectKey" element={<div>Mentett rendelés</div>} />
    </Routes>
  </MemoryRouter>);
}

function fillRequiredSourceData() {
  fireEvent.change(screen.getByLabelText(/Projektazonosító/), { target: { value: " DSMR-TEST-001 " } });
  fireEvent.change(screen.getByLabelText(/Projekt neve/), { target: { value: " Minta projekt " } });
  fireEvent.change(screen.getByLabelText(/Megrendelő \*/), { target: { value: " Minta Megrendelő " } });
  fireEvent.change(screen.getByLabelText(/Megnevezés/), { target: { value: " Bejárati ajtó " } });
}

function setPhoneViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 620px)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.stubEnv("DEV", true);
  setPhoneViewport(false);
  mutateAsync.mockClear();
  vi.mocked(useCreateSalesIntake).mockReturnValue({
    isPending: false,
    mutateAsync,
  } as unknown as ReturnType<typeof useCreateSalesIntake>);
  useUiStore.setState({ role: "sales" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("OrderIntakePage Sales source command", () => {
  it("submits contact, address, notes and exact cm-to-mm position source data", async () => {
    renderPage();
    fillRequiredSourceData();
    fireEvent.change(screen.getByLabelText("Munkaszám"), { target: { value: " TEST-001 " } });
    fireEvent.change(screen.getByLabelText("Megrendelő címe"), { target: { value: " 1111 Mintaváros, Próba utca 1. " } });
    fireEvent.change(screen.getByLabelText("Kapcsolattartó"), { target: { value: " Teszt Kapcsolattartó " } });
    fireEvent.change(screen.getByLabelText("Telefonszám"), { target: { value: " +36 20 000 0000 " } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " teszt@example.test " } });
    fireEvent.change(screen.getByLabelText("Szállítási cím"), { target: { value: " 1111 Mintaváros, Példa köz 2. " } });
    fireEvent.change(screen.getByLabelText("Várható szállítás pontossága"), { target: { value: "DAY" } });
    fireEvent.change(screen.getByLabelText("Várható szállítás — pontos nap"), { target: { value: "2026-09-18" } });
    fireEvent.change(screen.getByLabelText("Rendelési megjegyzés"), { target: { value: " Rendelési megjegyzés " } });
    fireEvent.change(screen.getByLabelText("Ajtótípus — forrásszöveg"), { target: { value: " CPL beltéri " } });
    fireEvent.change(screen.getByLabelText(/Örökölt nyitásmegadás/), { target: { value: " Bal be " } });
    fireEvent.change(screen.getByLabelText(/Örökölt közös felület — forrásszöveg/), { target: { value: " Minta CPL " } });
    fireEvent.change(screen.getByLabelText("Üvegezés"), { target: { value: "GLAZED" } });
    fireEvent.change(screen.getByLabelText("Üvegezés forrásszövege"), { target: { value: " Savmart " } });
    fireEvent.change(screen.getByLabelText(/FNY szélesség/), { target: { value: "81,5" } });
    fireEvent.change(screen.getByLabelText(/FNY magasság/), { target: { value: "211" } });
    fireEvent.change(screen.getByLabelText(/Kész falvastagság/), { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText(/Pozíció megjegyzése/), { target: { value: " P3 tesztmegjegyzés " } });

    expect(screen.getByText("Mentés: 815 mm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sales piszkozat mentése" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      projectKey: "DSMR-TEST-001",
      projectNum: "TEST-001",
      customerName: "Minta Megrendelő",
      customerAddress: "1111 Mintaváros, Próba utca 1.",
      contactName: "Teszt Kapcsolattartó",
      contactPhone: "+36 20 000 0000",
      contactEmail: "teszt@example.test",
      deliveryAddress: "1111 Mintaváros, Példa köz 2.",
      expectedDelivery: "2026-09-18T00:00:00.000Z",
      notes: "Rendelési megjegyzés",
      positions: [{
        code: "01",
        name: "Bejárati ajtó",
        quantity: 1,
        productType: "CPL beltéri",
        openingDirection: "Bal be",
        openingWidthMm: 815,
        openingHeightMm: 2110,
        openingDepthMm: 125,
        surface: "Minta CPL",
        glazing: "GLAZED",
        glazingSpecification: "Savmart",
        notes: "P3 tesztmegjegyzés",
      }],
    }));
    expect(mutateAsync.mock.calls[0][0].positions[0]).not.toHaveProperty("draftId");
    expect(await screen.findByText("Mentett rendelés")).toBeTruthy();
  });

  it("keeps stable drafts while switching the single editor", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Megnevezés/), { target: { value: "Első ajtó" } });
    fireEvent.click(screen.getByRole("button", { name: "Új ajtópozíció" }));
    expect(screen.getAllByLabelText(/Megnevezés/)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/Megnevezés/), { target: { value: "Második ajtó" } });

    fireEvent.click(screen.getByRole("button", { name: /01 Első ajtó/ }));
    expect(screen.getByLabelText(/Megnevezés/)).toHaveProperty("value", "Első ajtó");
    fireEvent.change(screen.getByLabelText("Pozíciókód *"), { target: { value: "A-01" } });
    expect(screen.getByRole("button", { name: /A-01 Első ajtó/ })).toBeTruthy();
  });

  it("allocates the smallest free two-digit code", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Új ajtópozíció" }));
    expect(screen.getByLabelText("Pozíciókód *")).toHaveProperty("value", "02");
    fireEvent.click(screen.getByRole("button", { name: /01 Névtelen pozíció/ }));
    fireEvent.change(screen.getByLabelText("Pozíciókód *"), { target: { value: "03" } });
    fireEvent.click(screen.getByRole("button", { name: "Új ajtópozíció" }));
    expect(screen.getByLabelText("Pozíciókód *")).toHaveProperty("value", "01");
  });

  it("marks every row that shares a normalized position code", async () => {
    const { container } = renderPage();
    fillRequiredSourceData();
    fireEvent.click(screen.getByRole("button", { name: "Új ajtópozíció" }));
    fireEvent.change(screen.getByLabelText(/Megnevezés/), { target: { value: "Második ajtó" } });
    fireEvent.change(screen.getByLabelText("Pozíciókód *"), { target: { value: " 01 " } });
    fireEvent.click(screen.getByRole("button", { name: "Sales piszkozat mentése" }));

    expect(await screen.findByText("A pozíciókódnak a revízión belül egyedinek kell lennie.")).toBeTruthy();
    expect(container.querySelectorAll(".sales-intake-position-row.is-invalid")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /01 Második ajtó/ }));
    expect(screen.getByText("A pozíciókódnak a revízión belül egyedinek kell lennie.")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("clears a stale glazing specification when NONE is selected", async () => {
    renderPage();
    fillRequiredSourceData();
    fireEvent.change(screen.getByLabelText("Üvegezés"), { target: { value: "GLAZED" } });
    fireEvent.change(screen.getByLabelText("Üvegezés forrásszövege"), { target: { value: "Régi specifikáció" } });
    fireEvent.change(screen.getByLabelText("Üvegezés"), { target: { value: "NONE" } });
    expect(screen.queryByLabelText("Üvegezés forrásszövege")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sales piszkozat mentése" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].positions[0]).toMatchObject({ glazing: "NONE", glazingSpecification: null });
    expect(await screen.findByText("Mentett rendelés")).toBeTruthy();
  });

  it("opens mobile detail, then returns focus with Back and Escape", async () => {
    setPhoneViewport(true);
    renderPage();
    const row = screen.getByRole("button", { name: /01 Névtelen pozíció/ });
    const workspace = row.closest(".sales-intake-position-workspace");
    fireEvent.click(row);
    expect(workspace?.classList.contains("is-mobile-detail")).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("article")));

    fireEvent.click(screen.getByRole("button", { name: /Vissza a pozíciókhoz/ }));
    await waitFor(() => expect(document.activeElement).toBe(row));
    fireEvent.click(row);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(workspace?.classList.contains("is-mobile-detail")).toBe(false);
  });

  it("keeps list focus on tablet and desktop selection", async () => {
    renderPage();
    const row = screen.getByRole("button", { name: /01 Névtelen pozíció/ });
    row.focus();
    fireEvent.click(row);
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(row.closest(".sales-intake-position-workspace")?.classList.contains("is-mobile-detail")).toBe(false);
  });

  it("fails closed for readers and pending mutations", () => {
    useUiStore.setState({ role: "reader" });
    const { container, unmount } = renderPage();
    const submit = screen.getByRole("button", { name: "Sales piszkozat mentése" });
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Új ajtópozíció" })).toBeNull();
    fireEvent.submit(container.querySelector("form")!);
    expect(mutateAsync).not.toHaveBeenCalled();
    unmount();

    useUiStore.setState({ role: "sales" });
    vi.mocked(useCreateSalesIntake).mockReturnValue({ isPending: true, mutateAsync } as unknown as ReturnType<typeof useCreateSalesIntake>);
    renderPage();
    expect(screen.getByRole("button", { name: "Mentés…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Új ajtópozíció" })).toHaveProperty("disabled", true);
  });

  it("blocks the Sales POST in a production build at DOM and handler level", () => {
    vi.stubEnv("DEV", false);
    const { container } = renderPage();
    expect(screen.getByText("AUTHENTICATED_SALES_PRINCIPAL_REQUIRED")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sales piszkozat mentése" })).toHaveProperty("disabled", true);
    fireEvent.submit(container.querySelector("form")!);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("blocks month-only delivery and structured appearance at handler level", async () => {
    const { container } = renderPage();
    fillRequiredSourceData();
    fireEvent.change(screen.getByLabelText("Várható szállítás pontossága"), { target: { value: "MONTH" } });
    fireEvent.change(screen.getByLabelText(/Várható szállítás — hónap/), { target: { value: "2026-09" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText(/DELIVERY_EXPECTATION_CONTRACT_REQUIRED/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Várható szállítás pontossága"), { target: { value: "UNRESOLVED" } });
    fireEvent.click(screen.getByLabelText(/Külön ajtólap-, tok-, tokborítás- vagy blendefelület van/));
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText(/STRUCTURED_APPEARANCE_CONTRACT_REQUIRED/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("blocks invalid dimensions and synchronous double submit", async () => {
    const pending = new Promise<never>(() => undefined);
    mutateAsync.mockImplementationOnce(() => pending);
    const { container } = renderPage();
    fillRequiredSourceData();
    fireEvent.change(screen.getByLabelText(/FNY szélesség/), { target: { value: "81.25" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText(/legfeljebb egy tizedessel/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/FNY szélesség/), { target: { value: "81,5" } });
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("does not expose manufacturing, document, BOM or release actions", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /dokumentum|BOM|gyártás|release|kiadás/i })).toBeNull();
    expect(screen.getByText(/külön rögzítési folyamat/i)).toBeTruthy();
    expect(screen.getByText(/blende és falpanel részletes adataihoz külön strukturált műszaki szerződés/i)).toBeTruthy();
    expect(screen.getByText(/eltérő ajtólap-, tok-, tokborítás- vagy blendefelületeket itt nem szabad összelapítani/i)).toBeTruthy();
    expect(screen.getByText(/csak hónap-pontosságú dátum és a nyers cm-szöveg lineage itt nem őrizhető meg/i)).toBeTruthy();
    expect(screen.getByText(/nyers cm-formázás.*nem marad meg lineage-ként/i)).toBeTruthy();
  });
});
