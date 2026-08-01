import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderDocument, ProductionOrderPosition } from "@/services/production/types";
import { OrderDocumentVersionsPanel } from "./OrderDocumentVersionsPanel";

afterEach(cleanup);

const position = { id: "position-1", code: "01", name: "Nappali ajtó" } as ProductionOrderPosition;
const firstVersion = {
  id: "document-v1",
  orderRevisionId: "revision-1",
  documentFamilyKey: "family-1",
  supersedesDocumentId: null,
  source: "LEGACY_FOLDER",
  kind: "DRAWING",
  displayName: "Ajtórajz.pdf",
  relativePath: "DSMR-1/Ajtorajz-v1.pdf",
  driveId: null,
  itemId: null,
  versionId: null,
  contentSha256: "a".repeat(64),
  positionLinks: [],
  releaseReferences: [],
  createdAt: "2026-07-30T10:00:00.000Z",
} as OrderDocument;
const secondVersion = {
  ...firstVersion,
  id: "document-v2",
  supersedesDocumentId: "document-v1",
  relativePath: "DSMR-1/Ajtorajz-v2.pdf",
  contentSha256: "b".repeat(64),
  createdAt: "2026-07-30T11:00:00.000Z",
} as OrderDocument;

describe("OrderDocumentVersionsPanel", () => {
  it("shows an immutable version chain and confirms an append-only position link", async () => {
    const onLinkPosition = vi.fn(async () => undefined);
    render(<OrderDocumentVersionsPanel
      documents={[firstVersion, secondVersion]}
      positions={[position]}
      canAddVersion
      canLinkPosition
      pending={false}
      onAddVersion={async () => undefined}
      onLinkPosition={onLinkPosition}
    />);

    expect(screen.getByRole("note").textContent).toContain("a tartalma ettől még nincs mezőszinten ellenőrizve");
    expect(screen.getByText("Rajzi forrás")).toBeTruthy();
    expect(screen.getByText(/2 változat/)).toBeTruthy();
    expect(screen.getByText("Aktuális változat")).toBeTruthy();
    expect(screen.getAllByText(/nem mezőszintű ellenőrzést/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "position-1" } });
    const linkButton = screen.getByRole("button", { name: "Kapcsolat rögzítése" });
    expect(linkButton).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(linkButton);

    await waitFor(() => expect(onLinkPosition).toHaveBeenCalledWith("document-v2", "position-1"));
  });

  it("labels a sales document as a source instead of checked survey content", () => {
    render(<OrderDocumentVersionsPanel
      documents={[{ ...firstVersion, kind: "SALES_ORDER", displayName: "Sales átadás.pdf" }]}
      positions={[]}
      canAddVersion={false}
      canLinkPosition={false}
      pending={false}
      onAddVersion={async () => undefined}
      onLinkPosition={async () => undefined}
    />);

    expect(screen.getByText("Sales forrás")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Forrásfájl rögzítve");
    expect(screen.queryByText(/^Felmérés$/)).toBeNull();
  });
});
