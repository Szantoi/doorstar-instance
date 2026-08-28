// This file intentionally has no imports and does not parse arguments or
// environment. It is the only local `proof:docker` entry point until an
// independently released verifier and authenticated one-run approval anchor
// exist outside the candidate checkout.
process.stderr.write("A03-FAIL:a03_gate1_external_trust_anchor_required\n");
process.exitCode = 1;
