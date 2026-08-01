import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DoorSideAppearancePanel } from "./DoorSideAppearancePanel";

afterEach(cleanup);

describe("DoorSideAppearancePanel", () => {
  it("presents the physical A/B views separately from casing roles", () => {
    render(<DoorSideAppearancePanel
      surface="Fóliás; fix: Highland Green; mozgó: Burlington Oak 2"
      legacyFinishLabel="Fóliás · legacy"
      wallDepthMm={143}
      context="TECHNICAL"
    />);

    const title = screen.getByRole("heading", { name: "Az ajtó két oldalának felületkezelése" });
    const summaryHeader = title.closest("header");
    expect(summaryHeader?.textContent).toContain("A oldal (SIDE_A)");
    expect(summaryHeader?.textContent).toContain("FIX és ÁLLÍTHATÓ nem az ajtó két oldala");

    const sideViews = screen.getByLabelText("A két helyiség felőli nézet");
    const sideCards = within(sideViews).getAllByRole("article");
    expect(sideCards).toHaveLength(2);
    expect(within(sideCards[0]).getByRole("heading", { name: "A oldal" })).toBeTruthy();
    expect(within(sideCards[1]).getByRole("heading", { name: "B oldal" })).toBeTruthy();
    expect(within(sideViews).getAllByText("Nincs még ehhez az oldalhoz rendelve")).toHaveLength(2);
    expect(within(sideViews).getAllByText("Még nincs eldöntve, van-e ezen az oldalon")).toHaveLength(2);

    expect(sideViews.textContent).not.toContain("Highland Green");
    expect(sideViews.textContent).not.toContain("Burlington Oak 2");
  });

  it("shows role-labelled legacy values as visible, unassigned source cards", () => {
    render(<DoorSideAppearancePanel
      surface="Fóliás; fix: Highland Green; mozgó: Burlington Oak 2"
      context="SUMMARY"
    />);

    const sources = screen.getByRole("region", { name: "A forrásban talált felületkezelések" });
    expect(within(sources).getByText("Forráscímke: FIX tokborítás")).toBeTruthy();
    expect(within(sources).getByText("Highland Green")).toBeTruthy();
    expect(within(sources).getByText("Forráscímke: ÁLLÍTHATÓ tokborítás")).toBeTruthy();
    expect(within(sources).getByText("Burlington Oak 2")).toBeTruthy();
    expect(within(sources).getByText("A két forrásjelölt felülete eltér.")).toBeTruthy();
    expect(within(sources).getByText(/nincs fizikai oldalhoz rendelve/)).toBeTruthy();
  });

  it("explains when the two role candidates are identical without assigning them to A/B", () => {
    render(<DoorSideAppearancePanel
      surface="Fóliás; fix: Magnolia; állítható: Magnolia"
      context="SUMMARY"
    />);

    const sources = screen.getByRole("region", { name: "A forrásban talált felületkezelések" });
    expect(within(sources).getByText("A két forrásjelölt felülete azonos.")).toBeTruthy();

    const sideViews = screen.getByLabelText("A két helyiség felőli nézet");
    expect(sideViews.textContent).not.toContain("Magnolia");
  });

  it.each([
    {
      surface: "Festett; fix: NCS S 5040-R80B",
      presentLabel: "Forráscímke: FIX tokborítás",
      absentLabel: "Forráscímke: ÁLLÍTHATÓ tokborítás",
      candidate: "NCS S 5040-R80B",
    },
    {
      surface: "állítható borítás: Tölgy",
      presentLabel: "Forráscímke: ÁLLÍTHATÓ tokborítás",
      absentLabel: "Forráscímke: FIX tokborítás",
      candidate: "Tölgy",
    },
  ])("keeps the single $presentLabel candidate unassigned without inventing its counterpart", ({
    surface,
    presentLabel,
    absentLabel,
    candidate,
  }) => {
    render(<DoorSideAppearancePanel surface={surface} context="SUMMARY" />);

    const sources = screen.getByRole("region", { name: "A forrásban talált felületkezelések" });
    expect(within(sources).getByText(presentLabel)).toBeTruthy();
    expect(within(sources).getByText(candidate)).toBeTruthy();
    expect(within(sources).queryByText(absentLabel)).toBeNull();
    expect(within(sources).queryByText(/A két forrásjelölt felülete/)).toBeNull();

    const sideViews = screen.getByLabelText("A két helyiség felőli nézet");
    expect(sideViews.textContent).not.toContain(candidate);
  });

  it("keeps a collapsed legacy value in its own source card", () => {
    render(<DoorSideAppearancePanel
      surface="Fóliás Supermatt Kashmir"
      legacyFinishLabel="Fóliás · Supermatt Kashmir"
      context="SUMMARY"
    />);

    const sources = screen.getByRole("region", { name: "A forrásban talált felületkezelések" });
    expect(within(sources).getByText("Összevont forrásérték")).toBeTruthy();
    expect(within(sources).getByText(/Nem osztható szét automatikusan/)).toBeTruthy();
    expect(within(sources).queryByText("Forráscímke: FIX tokborítás")).toBeNull();
    expect(within(sources).queryByText("Forráscímke: ÁLLÍTHATÓ tokborítás")).toBeNull();
  });

  it("keeps technical decisions and the raw source in separate closed details", () => {
    render(<DoorSideAppearancePanel
      surface="Fóliás; fix: Highland Green; mozgó: Burlington Oak 2"
      wallDepthMm={143}
      context="TECHNICAL"
    />);

    const technicalSummary = screen.getByText("Mit kell még műszakilag eldönteni?");
    const rawSourceSummary = screen.getByText("Eredeti forrásérték megtekintése");
    expect(technicalSummary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(rawSourceSummary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(technicalSummary.closest("details")?.textContent).toContain("143 mm");
    expect(technicalSummary.closest("details")?.textContent).toContain("Lehetséges megjelenési célok");
    expect(rawSourceSummary.closest("details")?.textContent).toContain("fix: Highland Green");
  });

  it("reports the empty state without rendering source or raw-value sections", () => {
    render(<DoorSideAppearancePanel surface={null} context="SURVEY" />);

    expect(screen.getByText("Nincs forrásérték")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "A forrásban talált felületkezelések" })).toBeNull();
    expect(screen.queryByText("Eredeti forrásérték megtekintése")).toBeNull();
  });
});
