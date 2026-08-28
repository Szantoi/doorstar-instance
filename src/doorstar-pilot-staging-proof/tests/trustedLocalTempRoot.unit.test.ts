import { describe, expect, it } from "vitest";
import {
  assertTrustedLocalTemporaryRoot,
  captureTrustedLocalTemporaryRoot,
  requireLocalFilesystemPath,
} from "../src/runner/trustedLocalTempRoot.js";

describe("trusted local temporary root", () => {
  it("captures and re-identifies the current OS temporary parent", () => {
    const root = captureTrustedLocalTemporaryRoot("a03_test_temp_root_invalid");
    expect(root.path).toBeTruthy();
    expect(root.realPath).toBeTruthy();
    expect(root.identity.device).toBeTypeOf("number");
    expect(root.identity.inode).toBeTypeOf("number");
    expect(() => assertTrustedLocalTemporaryRoot(root, "a03_test_temp_root_invalid")).not.toThrow();
  });

  it("rejects non-absolute, UNC, and device-style routes before filesystem access", () => {
    expect(() => requireLocalFilesystemPath("relative", "a03_test_temp_path_invalid"))
      .toThrow("a03_test_temp_path_invalid");
    if (process.platform === "win32") {
      expect(() => requireLocalFilesystemPath("\\\\server\\share\\tmp", "a03_test_temp_path_invalid"))
        .toThrow("a03_test_temp_path_invalid");
      expect(() => requireLocalFilesystemPath("\\\\?\\C:\\Temp", "a03_test_temp_path_invalid"))
        .toThrow("a03_test_temp_path_invalid");
      expect(() => requireLocalFilesystemPath("C:\\Temp\\proof.json:alternate-stream", "a03_test_temp_path_invalid"))
        .toThrow("a03_test_temp_path_invalid");
    }
  });

  it("rejects a caller-provided parent identity that does not match the host", () => {
    const root = captureTrustedLocalTemporaryRoot("a03_test_temp_root_invalid");
    expect(() => assertTrustedLocalTemporaryRoot({
      ...root,
      identity: { ...root.identity, inode: root.identity.inode + 1 },
    }, "a03_test_temp_root_invalid")).toThrow("a03_test_temp_root_invalid");
  });
});
