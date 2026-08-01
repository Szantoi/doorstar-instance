import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @ts-expect-error The frontend tsconfig intentionally excludes Node globals; Vitest still runs in Node.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ComponentSnapshot, ManufacturedItem, OrderDocument, ProductionOrderPosition } from "@/services/production/types";
import { OrderPosition360 } from "./OrderPosition360";

afterEach(cleanup);

const css = readFileSync("src/index.css", "utf8") as string;
const tabletCssStart = css.indexOf("@media (min-width: 621px) and (max-width: 1023px)");
const tabletCss = css.slice(tabletCssStart, css.indexOf("@media (max-width: 620px)", tabletCssStart));
const phoneCss = css.slice(css.lastIndexOf("@media (max-width: 620px)"));

const position = {
  id: "position-1",
  code: "01",
  name: "Nappali ajtó",
  quantity: 1,
  productType: "Falc nélküli",
  openingDirection: "Bal be",
  openingWidthMm: 900,
  openingHeightMm: 2100,
  openingDepthMm: 120,
  doorWidthMm: 820,
  doorHeightMm: 2040,
  doorThicknessMm: 40,
  surface: "Festett",
  wallTreatment: "NONE",
  glazing: "NONE",
  glazingSpecification: null,
  doorTypeKey: "frameless",
  finishKey: "painted",
  glassKey: "none",
  hardwareKeys: ["hinge-a"],
  wallSolutionKey: "none",
  materialKey: "mdf",
  machiningKeys: ["cnc"],
  technicalNotes: "Tokfurat ellenőrzendő.",
  notes: "Helyszínen mérve.",
  evidence: [{
    id: "evidence-1",
    field: "OPENING_WIDTH_MM",
    rawValue: "900",
    relativePath: "DSMR-1/Felmeres.pdf",
    sheet: null,
    page: 2,
    row: null,
    reviewState: "RESOLVED",
    resolution: "A felmérési forrással összevetve.",
    reviewedByPrincipal: "user:reviewer-1",
    reviewedByRole: "technical_preparation",
    reviewedAt: "2026-07-31T18:00:00.000Z",
    orderDocument: null,
  }],
} as ProductionOrderPosition;

const document = {
  id: "document-1",
  orderRevisionId: "revision-1",
  documentFamilyKey: "family-1",
  supersedesDocumentId: null,
  source: "SHAREPOINT",
  kind: "SURVEY",
  positionLinks: [{ orderPositionId: "position-1" }],
  releaseReferences: [],
  displayName: "Felmérési rajz.pdf",
  versionId: "v3",
  relativePath: "DSMR-1/Felmeresi rajz.pdf",
  driveId: "drive-1",
  itemId: "item-1",
  contentSha256: "a".repeat(64),
  createdAt: "2026-07-30T10:00:00.000Z",
} satisfies OrderDocument;

const manufacturedItem = {
  id: "item-1",
  code: "FP-01",
  name: "Falpanel",
  quantity: 1,
  state: "VERIFIED",
  relatedOrderPosition: { id: "position-1", code: "01", name: "Nappali ajtó" },
} as ManufacturedItem;

const snapshot = {
  id: "snapshot-1",
  state: "VERIFIED",
  calculatorProfileVersion: "adapter/v1",
  requirements: [{
    id: "requirement-1",
    sourceKind: "ORDER_POSITION",
    sourceRecordId: "position-1",
    componentKey: "door-leaf",
    name: "Ajtólap",
    quantity: 1,
    quantityUnit: "db",
  }],
} as ComponentSnapshot;

describe("OrderPosition360", () => {
  it("opens one position and joins its evidence, document and derived records", () => {
    render(<MemoryRouter><OrderPosition360
      positions={[position]}
      documents={[document]}
      manufacturedItems={[manufacturedItem]}
      componentSnapshots={[snapshot]}
      catalog={null}
      revisionNumber={1}
      ownerAction={{ href: "/orders/DSMR-1/survey", label: "Felmérési adatok szerkesztése" }}
    /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /01 Nappali ajtó/ }));

    expect(screen.getByText("Rögzített forrásadatok")).toBeTruthy();
    expect(screen.queryByText("Felmért fizikai tények")).toBeNull();
    expect(screen.getByText("Falnyílás: 900 × 2100 mm · kész fal: 120 mm")).toBeTruthy();
    expect(screen.getByText("Kész falvastagság · örökölt forrásadat")).toBeTruthy();
    expect(screen.getByText("Örökölt felületkatalógus")).toBeTruthy();
    expect(screen.getAllByText("Örökölt nyitásmegadás").length).toBeGreaterThan(0);
    const appearance = screen.getByRole("region", { name: "Az ajtó két oldalának felületkezelése" });
    const appearanceSources = within(appearance).getByRole("region", { name: "A forrásban talált felületkezelések" });
    expect(within(appearanceSources).getByText("Festett")).toBeTruthy();
    expect(within(within(appearance).getByLabelText("A két helyiség felőli nézet")).queryByText("Festett")).toBeNull();
    expect(screen.getByText("Felmérési rajz.pdf")).toBeTruthy();
    expect(screen.getByText(/door-leaf · Ajtólap/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Felmérési adatok szerkesztése/ }).getAttribute("href")).toBe("/orders/DSMR-1/survey?position=position-1");
  });

  it("warns when imported position values have no linked survey source", () => {
    render(<MemoryRouter><OrderPosition360
      positions={[{ ...position, evidence: [] }]}
      documents={[]}
      manufacturedItems={[]}
      componentSnapshots={[]}
      catalog={null}
      revisionNumber={1}
      initiallyOpen
    /></MemoryRouter>);

    const warning = screen.getByRole("note", { name: "Hiányzó felmérési forráskapcsolat" });
    expect(within(warning).getByText("Felmérési forráskapcsolat hiányzik")).toBeTruthy();
    expect(within(warning).getByText(/nincs közvetlenül kapcsolt felmérési forrásfájl/)).toBeTruthy();
    expect(screen.getByText("Rögzített forrásadatok")).toBeTruthy();
  });

  it("shows a neutral lineage note when a survey source is linked without field evidence", () => {
    render(<MemoryRouter><OrderPosition360
      positions={[{ ...position, evidence: [] }]}
      documents={[document]}
      manufacturedItems={[]}
      componentSnapshots={[]}
      catalog={null}
      revisionNumber={1}
      initiallyOpen
    /></MemoryRouter>);

    const note = screen.getByRole("note", { name: "Nincs mezőszintű evidence" });
    expect(within(note).getByText(/dokumentumkapcsolat nem mezőszintű ellenőrzés/)).toBeTruthy();
    expect(screen.queryByText("Felmérési forráskapcsolat hiányzik")).toBeNull();
  });

  it("separates an incomplete evidence audit from the document link state", () => {
    render(<MemoryRouter><OrderPosition360
      positions={[{ ...position, evidence: [{ ...position.evidence[0], reviewedByPrincipal: null }] }]}
      documents={[document]}
      manufacturedItems={[]}
      componentSnapshots={[]}
      catalog={null}
      revisionNumber={1}
      initiallyOpen
    /></MemoryRouter>);

    const warning = screen.getByRole("note", { name: "Lezáratlan evidence-ellenőrzés" });
    expect(within(warning).getByText("Evidence-ellenőrzés nincs lezárva")).toBeTruthy();
    expect(within(warning).getByText(/1 evidence-rekord döntése/)).toBeTruthy();
  });

  it("moves focus into the single detail and restores the opener and list position on Back", () => {
    const secondPosition = { ...position, id: "position-2", code: "02", name: "Hálószoba ajtó", evidence: [] };
    const view = render(<MemoryRouter><OrderPosition360
      positions={[position, secondPosition]}
      documents={[document]}
      manufacturedItems={[]}
      componentSnapshots={[]}
      catalog={null}
      revisionNumber={1}
    /></MemoryRouter>);
    const list = view.container.querySelector(".order-position-360-list") as HTMLDivElement;
    const opener = screen.getByRole("button", { name: /01 Nappali ajtó/ });
    list.scrollTop = 137;

    fireEvent.click(opener);

    const detail = screen.getByRole("article", { name: "Nappali ajtó" });
    expect(detail).toHaveFocus();
    expect(view.container.querySelectorAll(".order-position-360-detail")).toHaveLength(1);
    expect(view.container.querySelector(".order-position-360-list")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "← Vissza a tételekhez" }));
    expect(screen.queryByRole("article", { name: "Nappali ajtó" })).toBeNull();
    expect(opener).toHaveFocus();
    expect(list.scrollTop).toBe(137);
  });

  it("closes the selected position on Escape and restores row focus", () => {
    render(<MemoryRouter><OrderPosition360
      positions={[position]}
      documents={[document]}
      manufacturedItems={[]}
      componentSnapshots={[]}
      catalog={null}
      revisionNumber={1}
    /></MemoryRouter>);
    const opener = screen.getByRole("button", { name: /01 Nappali ajtó/ });
    fireEvent.click(opener);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("article", { name: "Nappali ajtó" })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("defines tablet split-view and phone list/detail exclusivity without duplicating detail markup", () => {
    expect(tabletCss).toMatch(/\.order-position-360-workspace\.has-detail\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*\.72fr\)\s+minmax\(0,\s*1\.28fr\)/);
    expect(tabletCss).toMatch(/\.order-position-360-row\s*\{[^}]*min-height:\s*48px;/);
    expect(tabletCss).toMatch(/\.order-position-360-workspace\.has-detail \.order-position-360-row > small:nth-of-type\(2\)\s*\{[^}]*display:\s*none;/);
    expect(tabletCss).toMatch(/\.order-position-360-workspace\.has-detail \.order-position-360-row > b\s*\{[^}]*grid-column:\s*2 \/ -1;[^}]*grid-row:\s*2;[^}]*justify-self:\s*start;/);
    expect(tabletCss).toMatch(/\.order-position-360-detail \.door-side-appearance-side-cards\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(phoneCss).toMatch(/\.order-position-360-workspace\.has-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(phoneCss).toMatch(/\.order-position-360-workspace\.has-detail \.order-position-360-list\s*\{[^}]*display:\s*none;/);
    expect(phoneCss).toMatch(/\.order-position-360-detail\s*\{[^}]*padding-bottom:\s*calc\(60px \+ env\(safe-area-inset-bottom\)\)/);
    expect(phoneCss).toMatch(/\.order-position-360-back\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*50;[^}]*bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\);[^}]*min-height:\s*48px;/);
    expect(phoneCss).toMatch(/\.doorstar-phone-more-panel\s*\{[^}]*z-index:\s*55;/);
  });
});
