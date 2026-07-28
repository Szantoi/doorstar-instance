import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateNetShiftMinutes, preflightDoorstarCalendarConfig } from "../src/services/planning/calendarConfigPreflight.js";
import { resolveLegacyDependencyBounds } from "../src/services/planning/dependencyBaseline.js";
import { preflightDoorstarPlanningInputPack, type DoorstarPlanningInputPack } from "../src/services/planning/inputPackPreflight.js";
import { calculateLegacyPlanningBaseline } from "../src/services/planning/legacyPlanningBaseline.js";

interface InputPack extends DoorstarPlanningInputPack {}

interface PackPin {
  fileName: string;
  packSchemaVersion: string;
  sha256: string;
  immutable: boolean;
}

interface InputPackManifest {
  schemaVersion: string;
  packs: PackPin[];
}

async function loadInputPack(version = "v1"): Promise<InputPack> {
  const path = resolve(process.cwd(), "..", "..", "docs", "projects", "doorstar-production-planning", "fixtures", `doorstar-planning-input-pack.${version}.json`);
  return JSON.parse(await readFile(path, "utf8")) as InputPack;
}

async function loadManifest(): Promise<InputPackManifest> {
  const path = resolve(process.cwd(), "..", "..", "docs", "projects", "doorstar-production-planning", "fixtures", "doorstar-planning-input-pack.manifest.json");
  return JSON.parse(await readFile(path, "utf8")) as InputPackManifest;
}

describe("Doorstar Planning input pack", () => {
  it("keeps every published legacy calculation vector compatible with the reference calculation", async () => {
    const pack = await loadInputPack();
    expect(pack.schemaVersion).toBe("1.0");

    for (const vector of pack.legacyCalculationVectors) {
      expect(calculateLegacyPlanningBaseline(vector.input)).toMatchObject(vector.expected);
    }
  });

  it("preserves all four dependency types and precedence rules in the compatibility pack", async () => {
    const pack = await loadInputPack();
    expect(pack.dependencyCompatibilityVectors).toHaveLength(6);

    for (const vector of pack.dependencyCompatibilityVectors) {
      expect(resolveLegacyDependencyBounds(vector.input)).toMatchObject(vector.expected);
    }
  });

  it("keeps v1 immutable while accepting the explicitly versioned v2 expansion", async () => {
    const v1 = await loadInputPack();
    const v2 = await loadInputPack("v2");

    expect(v1.schemaVersion).toBe("1.0");
    expect(v2.schemaVersion).toBe("2.0.0");
    expect(v1.dependencyCompatibilityVectors).toHaveLength(6);
    expect(v2.dependencyCompatibilityVectors).toHaveLength(7);
    expect(preflightDoorstarPlanningInputPack(v1).readyForPlatformContractReview).toBe(true);
    expect(preflightDoorstarPlanningInputPack(v2).readyForPlatformContractReview).toBe(true);
  });

  it("requires every fixture content pin and declared pack version to match", async () => {
    const manifest = await loadManifest();
    expect(manifest.schemaVersion).toBe("1.0");

    for (const pin of manifest.packs) {
      const path = resolve(process.cwd(), "..", "..", "docs", "projects", "doorstar-production-planning", "fixtures", pin.fileName);
      const content = await readFile(path);
      const pack = JSON.parse(content.toString("utf8")) as InputPack;

      expect(createHash("sha256").update(content).digest("hex").toUpperCase()).toBe(pin.sha256);
      expect(pack.schemaVersion).toBe(pin.packSchemaVersion);
    }
  });

  it("contains only schedulable standard samples and a preflight-valid calendar draft", async () => {
    const pack = await loadInputPack();
    expect(pack.operationStandardSamples).toHaveLength(3);
    for (const standard of pack.operationStandardSamples) {
      expect(standard.sourceTaskKey).not.toHaveLength(0);
      expect(standard.unitSeconds).toBeGreaterThan(0);
      expect(standard.workforce).toBeGreaterThan(0);
      expect(["FS", "SS", "FF", "SF"]).toContain(standard.dependencyType);
    }

    expect(preflightDoorstarCalendarConfig(pack.calendarDraft.resources, pack.calendarDraft.capacityPolicy).quarantined).toEqual([]);
    const legacyDayMinutes = pack.legacyCalculationVectors[0]?.input.workingMinutesPerDay;
    expect(legacyDayMinutes).toBeTypeOf("number");
    for (const resource of pack.calendarDraft.resources) {
      for (const shift of resource.shifts ?? []) {
        expect(calculateNetShiftMinutes(shift)).toBe(legacyDayMinutes);
      }
    }
  });

  it("is coherent for platform contract review while naming the remaining human approvals", async () => {
    const pack = await loadInputPack();

    expect(preflightDoorstarPlanningInputPack(pack)).toEqual({
      readyForPlatformContractReview: true,
      issues: [
        {
          code: "calendar_approval_required",
          severity: "action_required",
          detail: "The C# tenant policy must determine the calendar approval workflow before import or reservation.",
        },
        {
          code: "contract_reviewer_required",
          severity: "action_required",
          detail: "The C# tenant policy must determine the Planning OpenAPI review workflow before release.",
        },
      ],
    });
  });

  it("fails contract-review readiness when provenance or a compatibility vector is altered", async () => {
    const pack = structuredClone(await loadInputPack());
    pack.sourceProvenance.unitTimeCatalogue.sha256 = "not-a-sha256";
    pack.dependencyCompatibilityVectors[0]!.expected = { earliestStartMinute: 999 };

    const result = preflightDoorstarPlanningInputPack(pack);

    expect(result.readyForPlatformContractReview).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "invalid_source_fingerprint",
      "invalid_dependency_vector",
    ]));
  });

  it("requires the approval workflow to remain platform-owned", async () => {
    const pack = structuredClone(await loadInputPack());
    pack.approvalWorkflow = "local_default" as "platform_tenant_policy_required";

    const result = preflightDoorstarPlanningInputPack(pack);

    expect(result.readyForPlatformContractReview).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_approval_workflow_owner");
  });
});
