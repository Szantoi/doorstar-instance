export interface PanelProps {
  /** Uppercase fejléc-sáv; elhagyható */
  title?: string;
  /** true: narancs fejléc (pl. "Kiosztva" panel); alap: sötét króm + sárga betű */
  accent?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
