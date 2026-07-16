/**
 * Demo data mirroring the original Üzemi Tábla design mock's seed() function,
 * so a fresh checkout looks like the live prototype instead of an empty board.
 * Re-runnable: clears the tables it owns before inserting.
 */
import { PrismaClient } from "@prisma/client";
import { monday } from "../src/domain/dates.js";

const prisma = new PrismaClient();

type StepDef = { name: string; station: string };
type EpicDef = { name: string; quantityLabel: string; steps: StepDef[] };

function steps(pairs: Array<[string, string]>): StepDef[] {
  return pairs.map(([name, station]) => ({ name, station }));
}

function doorMM(): EpicDef[] {
  return [
    {
      name: "Lap 5-ös",
      quantityLabel: "7 db",
      steps: steps([
        ["HDF", "Körfűrész"], ["Keret + betét", "Asztalos"], ["Összerak", "Asztalos"], ["Préselés", "Asztalos"],
        ["CNC kontúr", "CNC"], ["CNC minta/betét", "CNC"], ["Ragasztás", "Asztalos"], ["Ker. csiszol", "Csiszoló"],
        ["Fújás", "Fújó"], ["Él-lécezés", "Bürkle"], ["CNC pánt-zár", "CNC"],
      ]),
    },
    {
      name: "Borítás",
      quantityLabel: "36 db",
      steps: steps([
        ["Kiválogat", "Egyéb"], ["Megírás", "Egyéb"], ["Gérvágás", "Körfűrész"], ["Gér összehúzó fúrás", "Asztalos"],
        ["Ker. csiszol", "Csiszoló"], ["Fújás", "Fújó"], ["Paknizás", "Egyéb"], ["CNC zár", "CNC"], ["Gumizás", "Egyéb"],
      ]),
    },
    {
      name: "Tok 22-es",
      quantityLabel: "6 db",
      steps: steps([
        ["Szab", "Körfűrész"], ["Marás", "CNC"], ["Gérvágás", "Körfűrész"], ["Tok kapocs", "Asztalos"],
        ["Ker. csiszol", "Csiszoló"], ["Fújás", "Fújó"], ["Paknizás", "Egyéb"], ["CNC zár", "CNC"], ["Gumizás", "Egyéb"],
        ["Tok összerak", "Asztalos"],
      ]),
    },
    {
      name: "Falpanel / Blende",
      quantityLabel: "",
      steps: steps([
        ["18-as szab", "Körfűrész"], ["CNC kontúr", "CNC"], ["CNC minta", "CNC"], ["Csap ragasztás", "Asztalos"],
        ["Ker. csiszol", "Csiszoló"], ["Paknizás", "Egyéb"], ["Pánt", "Asztalos"],
      ]),
    },
    {
      name: "Kész termék",
      quantityLabel: "",
      steps: steps([
        ["Raszter", "Egyéb"], ["Csomagolás", "Egyéb"], ["Raktár", "Száll./Kész"], ["Beépítés", "Száll./Kész"],
      ]),
    },
  ];
}

async function main() {
  const week = monday(new Date());

  await prisma.$transaction([
    prisma.taskAuditEntry.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.taskImage.deleteMany(),
    prisma.task.deleteMany(),
    prisma.epicStep.deleteMany(),
    prisma.epic.deleteMany(),
    prisma.projectSheet.deleteMany(),
    prisma.project.deleteMany(),
    prisma.orderChecklistItem.deleteMany(),
    prisma.weekNote.deleteMany(),
    prisma.stationWorkflow.deleteMany(),
    prisma.sheetTemplate.deleteMany(),
    prisma.epikTemplate.deleteMany(),
  ]);

  await prisma.capacitySetting.upsert({
    where: { id: "default" },
    create: { id: "default", hoursPerDay: 8 },
    update: {},
  });

  await prisma.stationWorkflow.create({
    data: { station: "Bürkle", steps: ["Felvett", "Élzárás", "Lécezés", "Kész"] },
  });

  await prisma.weekNote.create({
    data: { week, text: "Körfűrész csütörtök: Derby gérvágás\nAsztalos 13–8: Koroknai" },
  });

  const projects = await Promise.all([
    prisma.project.create({ data: { key: "tormay", name: "Tormay" } }),
    prisma.project.create({ data: { key: "koroknai", name: "Koroknai", num: "25168" } }),
    prisma.project.create({ data: { key: "derby", name: "Derby", num: "26112" } }),
    prisma.project.create({ data: { key: "lfa", name: "LFA", num: "26117" } }),
    prisma.project.create({ data: { key: "matyi", name: "Matyi" } }),
  ]);
  const [tormay, koroknai, derby, lfa, matyi] = projects;

  const mm = doorMM();
  for (const project of [koroknai, derby, lfa]) {
    for (const [epicIndex, epic] of mm.entries()) {
      await prisma.epic.create({
        data: {
          projectId: project.id,
          name: epic.name,
          quantityLabel: epic.quantityLabel,
          position: epicIndex,
          steps: { create: epic.steps.map((s, i) => ({ name: s.name, station: s.station, position: i })) },
        },
      });
    }
  }

  await prisma.projectSheet.create({
    data: {
      projectId: koroknai.id,
      kind: "QUANTITIES",
      data: {
        menny: [
          { name: "Ajtólap", felulet: "Festett", db: "6 db" },
          { name: "Tokmag", felulet: "Festett", db: "18 db" },
          { name: "Borítás", felulet: "Festett", db: "36 db" },
          { name: "Blende", felulet: "—", db: "Nincs" },
        ],
        mennyBreak: [
          { label: "Tokmag · Síkban · Fix oldali · 48 mm", vsz: "6 db", fugg: "12 db" },
          { label: "Tokmag · Tokba · Mozgó oldali · 68 mm", vsz: "6 db", fugg: "12 db" },
          { label: "Borítás · Síkban · 22 mm", vsz: "6 db", fugg: "12 db" },
          { label: "Borítás · Tokba · 22 mm", vsz: "6 db", fugg: "12 db" },
        ],
      },
    },
  });

  await prisma.projectSheet.create({
    data: {
      projectId: koroknai.id,
      kind: "CUTTING",
      data: {
        rows: [
          { i: 1, sz: "62,2", h: "199,8", db: 2, anyag: "Mély MDF", megj: "Síkban" },
          { i: 2, sz: "66,2", h: "196,8", db: 2, anyag: "Mély MDF", megj: "Síkban" },
          { i: 3, sz: "64,2", h: "196,8", db: 2, anyag: "Mély MDF", megj: "Síkban" },
        ],
      },
    },
  });

  await prisma.projectSheet.create({
    data: {
      projectId: koroknai.id,
      kind: "HARDWARE",
      data: {
        rows: [
          { i: 1, nyitas: "FNY · Bal", pant: "AGB 2.0", lap: "68 × 203", tok: "76 × 207", uveg: "13,5", zar: "BB 50", kilincs: "1040", megj: "" },
          { i: 2, nyitas: "FNY · Bal", pant: "AGB 2.0", lap: "72 × 200", tok: "80 × 204", uveg: "13,5", zar: "BB 50", kilincs: "1040", megj: "" },
        ],
      },
    },
  });

  await Promise.all(
    [
      { day: 0, station: "Körfűrész", project: tormay, title: "Szabás + méretre vágás", stepIndex: 1 },
      { day: 0, station: "Asztalos", project: koroknai, title: "Tok összerakás", stepIndex: 1 },
      { day: 0, station: "CNC", project: derby, title: "Ajtólap kontúr + minta", stepIndex: 0 },
      { day: 1, station: "CNC", project: koroknai, title: "Tok pántolás", stepIndex: 1, urgent: true },
      { day: 1, station: "Csiszoló", project: lfa, title: "Szegőragasztás", stepIndex: 0 },
      { day: 2, station: "Bürkle", project: lfa, title: "Tok + borítás", stepIndex: 2 },
      { day: 2, station: "Asztalos", project: derby, title: "Pakolás + csomagolás", stepIndex: 0 },
      { day: 3, station: "Fújó", project: lfa, title: "Tok + szegő fújás", stepIndex: 1 },
      { day: 3, station: "Egyéb", project: derby, title: "Ellenőrzés, DU.", stepIndex: 0 },
      { day: 4, station: "Asztalos", project: koroknai, title: "Összeszerelés + csomi", stepIndex: 0 },
      { day: 1, station: null, project: matyi, title: "Szabás, egyedi élragasztás", stepIndex: 0 },
      { day: 4, station: null, project: derby, title: "Gérvágás + prés", stepIndex: 0, urgent: true },
    ].map((t) =>
      prisma.task.create({
        data: {
          title: t.title,
          station: t.station,
          week,
          day: t.day,
          stepIndex: t.stepIndex,
          urgent: t.urgent ?? false,
          projectId: t.project.id,
          epicName: null,
          audit: { create: [{ label: "Kiadva a táblára" }] },
        },
      })
    )
  );

  await Promise.all(
    [
      { label: "Smart Cube", done: false },
      { label: "Koroknai 25168", done: true },
      { label: "Derby 26112", done: false },
      { label: "LFA 26117", done: false },
      { label: "Tormay", done: false },
      { label: "Szabadi", done: false },
      { label: "Maboros", done: false },
    ].map((o, position) => prisma.orderChecklistItem.create({ data: { ...o, position } }))
  );

  await prisma.sheetTemplate.create({ data: { name: "Ajtó (alap)", epics: mm } });
  await prisma.sheetTemplate.create({ data: { name: "Falpanel", epics: [mm[3], mm[4]] } });
  await prisma.sheetTemplate.create({
    data: {
      name: "Bútor (alap)",
      epics: [
        {
          name: "Bútorfront",
          quantityLabel: "",
          steps: steps([
            ["Szabás", "Körfűrész"], ["CNC megmunkálás", "CNC"], ["Élzárás", "Bürkle"], ["Csiszolás", "Csiszoló"],
            ["Fújás", "Fújó"], ["Összeszerelés", "Asztalos"],
          ]),
        },
        {
          name: "Korpusz",
          quantityLabel: "",
          steps: steps([["Szabás", "Körfűrész"], ["Élzárás", "Bürkle"], ["Fúrás", "CNC"], ["Összeszerelés", "Asztalos"]]),
        },
        mm[4],
      ],
    },
  });

  console.log("Seed complete:", { week, projects: projects.map((p) => p.key) });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
