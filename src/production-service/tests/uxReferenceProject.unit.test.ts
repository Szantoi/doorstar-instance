import { describe, expect, it } from "vitest";
import {
  assertUxReferenceTarget,
  FLOW_LAB_DEMO_SCHEMA,
  UX_REFERENCE_DATABASE_NAME,
  UX_REFERENCE_SCHEMA,
} from "../scripts/uxReferenceProjectTarget.js";

const confirmation = ["--confirm-ux-reference-seed"];

describe("UX reference seed target guard", () => {
  it("accepts the dedicated loopback schema", () => {
    const target = assertUxReferenceTarget({
      databaseUrl: `postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=${UX_REFERENCE_SCHEMA}`,
      arguments: confirmation,
    });
    expect(target.databaseName).toBe(UX_REFERENCE_DATABASE_NAME);
    expect(target.schema).toBe(UX_REFERENCE_SCHEMA);
  });

  it("accepts only the named synthetic Flow Lab demo schema", () => {
    const target = assertUxReferenceTarget({
      databaseUrl: `postgresql://doorstar:doorstar@127.0.0.1:5462/doorstar_production?schema=${FLOW_LAB_DEMO_SCHEMA}`,
      arguments: confirmation,
    });
    expect(target).toMatchObject({
      databaseName: UX_REFERENCE_DATABASE_NAME,
      schema: FLOW_LAB_DEMO_SCHEMA,
    });
  });

  it("requires a second explicit confirmation for the local public development schema", () => {
    const databaseUrl = "postgresql://doorstar:doorstar@127.0.0.1:5462/doorstar_production?schema=public";
    expect(() => assertUxReferenceTarget({ databaseUrl, arguments: confirmation })).toThrow(/refused schema 'public'/);
    expect(assertUxReferenceTarget({
      databaseUrl,
      arguments: [...confirmation, "--confirm-local-development-database"],
    }).schema).toBe("public");
  });

  it("rejects another database name even behind loopback with every confirmation", () => {
    expect(() => assertUxReferenceTarget({
      databaseUrl: "postgresql://doorstar:doorstar@localhost:5462/customer_production?schema=public",
      arguments: [...confirmation, "--confirm-local-development-database"],
    })).toThrow(/refused database 'customer_production'/);
    expect(() => assertUxReferenceTarget({
      databaseUrl: `postgresql://doorstar:doorstar@localhost:5462/customer_production?schema=${UX_REFERENCE_SCHEMA}`,
      arguments: confirmation,
    })).toThrow(/refused database 'customer_production'/);
  });

  it("accepts a generated Vitest schema only inside the allowlisted database", () => {
    const target = assertUxReferenceTarget({
      databaseUrl: "postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=doorstar_test_vitest_123_fixture",
      arguments: confirmation,
      nodeEnv: "test",
    });
    expect(target).toMatchObject({
      databaseName: UX_REFERENCE_DATABASE_NAME,
      schema: "doorstar_test_vitest_123_fixture",
    });
  });

  it("rejects remote hosts, arbitrary schemas and missing confirmation", () => {
    expect(() => assertUxReferenceTarget({
      databaseUrl: `postgresql://doorstar:doorstar@db.example.test:5432/doorstar?schema=${UX_REFERENCE_SCHEMA}`,
      arguments: confirmation,
    })).toThrow(/loopback/);
    expect(() => assertUxReferenceTarget({
      databaseUrl: "postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=customer_data",
      arguments: confirmation,
    })).toThrow(/refused schema/);
    expect(() => assertUxReferenceTarget({
      databaseUrl: `postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=${UX_REFERENCE_SCHEMA}`,
      arguments: [],
    })).toThrow(/confirm-ux-reference-seed/);
    expect(() => assertUxReferenceTarget({
      databaseUrl: `mysql://doorstar:doorstar@localhost:5462/doorstar_production?schema=${UX_REFERENCE_SCHEMA}`,
      arguments: confirmation,
    })).toThrow(/PostgreSQL/);
  });
});
