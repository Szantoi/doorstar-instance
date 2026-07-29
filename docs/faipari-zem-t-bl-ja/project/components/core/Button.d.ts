/** @startingPoint section="Components" subtitle="Tábla-gomb: outline / primary / chrome / active / danger" viewport="700x160" */
export interface ButtonProps {
  /** outline (fehér, invert hoverre) | primary (kiadás-kék) | chrome (sötét menü) | active (sárga menü) | danger (visszavon) */
  variant?: 'outline' | 'primary' | 'chrome' | 'active' | 'danger';
  children?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
