import { describe, expect, it } from "vitest";
import { resolveFlowLabReadonlyUrl } from "./readOnlyDemo";

describe("resolveFlowLabReadonlyUrl", () => {
  it("accepts an absolute HTTPS URL without credentials", () => {
    expect(resolveFlowLabReadonlyUrl(" https://doorstar.asztalostech.hu/flow-lab-demo/ "))
      .toBe("https://doorstar.asztalostech.hu/flow-lab-demo/");
  });

  it.each([
    undefined,
    "",
    " /flow-lab-demo/ ",
    "//doorstar.asztalostech.hu/flow-lab-demo/",
    "http://doorstar.asztalostech.hu/flow-lab-demo/",
    "javascript:alert(1)",
    "https://reader@doorstar.asztalostech.hu/flow-lab-demo/",
    "https://reader:secret@doorstar.asztalostech.hu/flow-lab-demo/",
  ])("fails closed for %j", (value) => {
    expect(resolveFlowLabReadonlyUrl(value)).toBeNull();
  });
});
