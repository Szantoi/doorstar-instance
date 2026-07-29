export interface StatusChipProps {
  /** assigned=narancs | inprogress=kék | done=zöld | problem=piros */
  status?: 'assigned' | 'inprogress' | 'done' | 'problem';
  /** Felirat felülírása (alap: magyar státusznév) */
  label?: string;
  /** Ha megadod, pötty helyett darabszám-kapszula */
  count?: number;
}
