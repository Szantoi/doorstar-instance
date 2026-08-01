import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/apiClient";
import type { ComponentSnapshot } from "@/services/production/types";
import { ComponentSnapshotsPanel } from "./ComponentSnapshotsPanel";

afterEach(cleanup);

const snapshot = {
  id: "snapshot-1",
  state: "REVIEW",
  calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
  sourceWorkOrderKey: "DSMR-1",
  sourceOrderRevision: "1",
  orderContentHash: "a".repeat(64),
  snapshotSchemaVersion: "doorstar-component-snapshot/v1",
  technicalCatalogVersion: "doorstar-technical-catalog/v1",
  outputHash: "b".repeat(64),
  requirements: [{
    id: "requirement-1",
    componentKey: "door-leaf",
    name: "Ajtólap",
    quantity: 1,
    quantityUnit: "db",
    sourceKind: "ORDER_POSITION",
    sourceRecordId: "position-1",
    sourceComponentKey: "P01:door-leaf",
    requirementKind: "CUT_PART",
    materialKey: "mdf-standard",
    finishKey: "painted-ral",
    finishedWidthMm: 820,
    finishedHeightMm: 2040,
    finishedThicknessMm: 40,
    cuttingWidthMm: 830,
    cuttingHeightMm: 2050,
    cuttingThicknessMm: 42,
    lineHash: "c".repeat(64),
    grainDirection: "hosszirány",
    notes: "",
  }],
  reviewNote: "A létrehozó minden explicit méretet ellenőrzött.",
} as ComponentSnapshot;

describe("ComponentSnapshotsPanel", () => {
  it("keeps REVIEW snapshots non-releasable and requires a review resolution", async () => {
    const onReview = vi.fn(async () => undefined);
    render(<ComponentSnapshotsPanel
      snapshots={[snapshot]}
      revisionStatus="APPROVED"
      loading={false}
      error={false}
      canReview
      pending={false}
      authorityReady
      reviewContext={{
        approvedOrderContentHash: "a".repeat(64),
        snapshotSchemaVersion: "doorstar-component-snapshot/v1",
        activeProfileVersions: ["doorstar-explicit-component-adapter/v1"],
      }}
      onReview={onReview}
    />);

    expect(screen.getByText("Nem kiadható")).toBeTruthy();
    expect(screen.getByText("A létrehozó minden explicit méretet ellenőrzött.")).toBeTruthy();
    expect(screen.getByText("P01:door-leaf")).toBeTruthy();
    expect(screen.getByText("hosszirány")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /kiadás/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Elfogadás" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Az explicit méretek ellenőrzésének eredménye"), {
      target: { value: "Az adapterkimenet ellenőrizve." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Elfogadás" }));

    await waitFor(() => expect(onReview).toHaveBeenCalledWith(
      "snapshot-1",
      "VERIFIED",
      "Az adapterkimenet ellenőrizve.",
    ));
  });

  it("blocks verification but lets an authorized reviewer reject a stale REVIEW snapshot", async () => {
    const onReview = vi.fn(async () => undefined);
    render(<ComponentSnapshotsPanel
      snapshots={[snapshot]}
      revisionStatus="APPROVED"
      loading={false}
      error={false}
      canReview
      pending={false}
      authorityReady
      reviewContext={null}
      onReview={onReview}
    />);

    expect(screen.getByText("Elfogadás zárolva")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elfogadás" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Elutasítás" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Az explicit méretek ellenőrzésének eredménye"), {
      target: { value: "Az elavult snapshot lezárva." },
    });
    expect(screen.getByRole("button", { name: "Elfogadás" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Elutasítás" }));

    await waitFor(() => expect(onReview).toHaveBeenCalledWith(
      "snapshot-1",
      "REJECTED",
      "Az elavult snapshot lezárva.",
    ));
  });

  it("keeps the note and explains an aggregate evidence gate failure", async () => {
    const onReview = vi.fn(async () => {
      throw new ApiError(409, "conflict", {
        error: "component_source_evidence_unresolved",
        details: {
          manufacturedItems: { total: 3, ready: 1, unresolved: 2 },
          supplementaryItems: { total: 2, ready: 1, unresolved: 1 },
        },
      });
    });
    render(<ComponentSnapshotsPanel
      snapshots={[snapshot]}
      revisionStatus="APPROVED"
      loading={false}
      error={false}
      canReview
      pending={false}
      authorityReady
      reviewContext={{
        approvedOrderContentHash: "a".repeat(64),
        snapshotSchemaVersion: "doorstar-component-snapshot/v1",
        activeProfileVersions: ["doorstar-explicit-component-adapter/v1"],
      }}
      onReview={onReview}
    />);

    const note = screen.getByPlaceholderText("Az explicit méretek ellenőrzésének eredménye");
    fireEvent.change(note, { target: { value: "A snapshot ellenőrizve." } });
    fireEvent.click(screen.getByRole("button", { name: "Elfogadás" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("2 külön gyártott tétel, 1 tartozék");
    expect(note).toHaveProperty("value", "A snapshot ellenőrizve.");
  });

  it.each([
    { state: "dependency refetch", loading: true, error: false },
    { state: "dependency error", loading: false, error: true },
  ])("blocks both review decisions during $state", ({ loading, error }) => {
    const onReview = vi.fn(async () => undefined);
    render(<ComponentSnapshotsPanel
      snapshots={[snapshot]}
      revisionStatus="APPROVED"
      loading={loading}
      error={error}
      canReview
      pending={false}
      authorityReady={false}
      reviewContext={{
        approvedOrderContentHash: "a".repeat(64),
        snapshotSchemaVersion: "doorstar-component-snapshot/v1",
        activeProfileVersions: ["doorstar-explicit-component-adapter/v1"],
      }}
      onReview={onReview}
    />);

    fireEvent.change(screen.getByPlaceholderText("Az explicit méretek ellenőrzésének eredménye"), {
      target: { value: "A snapshot döntése előkészítve." },
    });
    const accept = screen.getByRole("button", { name: "Elfogadás" });
    const reject = screen.getByRole("button", { name: "Elutasítás" });
    expect(accept).toHaveProperty("disabled", true);
    expect(reject).toHaveProperty("disabled", true);
    fireEvent.click(accept);
    fireEvent.click(reject);
    expect(onReview).not.toHaveBeenCalled();
  });
});
