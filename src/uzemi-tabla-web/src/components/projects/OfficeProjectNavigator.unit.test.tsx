import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OfficeProjectNavigator } from "./OfficeProjectNavigator";

afterEach(cleanup);

describe("OfficeProjectNavigator", () => {
  it("keeps the exact project context visible and links only existing office workspaces", () => {
    render(
      <MemoryRouter>
        <OfficeProjectNavigator projectKey="UX-FLOW/01" revisionNumber={3} current="TECHNICAL_PREPARATION" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "UX-FLOW/01 · R03" })).toBeInTheDocument();
    expect(screen.getByText("Műszaki előkészítés").closest("span")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Státusz és következő teendő/ })).toHaveAttribute("href", "/projects/UX-FLOW%2F01");
    expect(screen.getByRole("link", { name: /Alkatrészképzés/ })).toHaveAttribute("href", "/orders/UX-FLOW%2F01/revisions/3/calculator");
    expect(screen.getByRole("link", { name: /Műveletterv/ })).toHaveAttribute("href", "/orders/UX-FLOW%2F01/revisions/3/operations");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/nem készültségjelző/i)).toBeInTheDocument();
  });

  it("does not expose exact-revision workspaces as links when revision context is missing", () => {
    render(
      <MemoryRouter>
        <OfficeProjectNavigator projectKey="UX-FLOW-01" current="ORDER" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "UX-FLOW-01 · Nincs exact revízió" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Alkatrészképzés/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Műveletterv/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Exact revízió szükséges")).toHaveLength(2);
  });

  it("marks the project cockpit as the current page without a redundant status link", () => {
    render(
      <MemoryRouter>
        <OfficeProjectNavigator projectKey="UX-FLOW-01" revisionNumber={1} current="PROJECT" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Projektállapot").closest("span")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: /Státusz és következő teendő/ })).not.toBeInTheDocument();
  });

  it("keeps revision-less editing routes closed for a historical snapshot", () => {
    render(
      <MemoryRouter>
        <OfficeProjectNavigator projectKey="UX-FLOW-01" revisionNumber={1} current="ORDER" historicalRevision />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Státusz és következő teendő/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Felmérés/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Műszaki előkészítés/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Csak a legfrissebb revízión")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Alkatrészképzés/ })).toHaveAttribute("href", "/orders/UX-FLOW-01/revisions/1/calculator");
  });
});
