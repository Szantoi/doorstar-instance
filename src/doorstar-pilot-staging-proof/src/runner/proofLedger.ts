import { A03ProofError } from "./a03Config.js";

export class ProofLedger {
  private readonly completedMarkers: string[] = [];

  public constructor(private readonly onPass: (marker: string) => void = () => undefined) {}

  public pass(marker: string): void {
    if (!/^[A-Z0-9_]{4,100}$/.test(marker) || this.completedMarkers.includes(marker)) {
      throw new A03ProofError("a03_proof_marker_invalid");
    }
    this.completedMarkers.push(marker);
    this.onPass(`A03-PASS:${marker}`);
  }

  public markers(): readonly string[] {
    return [...this.completedMarkers];
  }
}
