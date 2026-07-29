/** @startingPoint section="Components" subtitle="Kézírásos feladatkártya — a szín a státusz" viewport="700x210" */
export interface TaskCardProps {
  /** Formátum: "Megrendelő Munkaszám — Epik · Lépés" */
  title: string;
  status?: 'assigned' | 'inprogress' | 'done' | 'problem';
  /** Apró szürke UI-sor: nap, db, megj. szám stb. */
  meta?: string;
  /** !! előtag + aláhúzás */
  urgent?: boolean;
  /** Determinisztikus dőlés-hash (pl. task id hash) */
  seed?: number;
  onClick?: () => void;
}
