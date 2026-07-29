import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useUiStore, type Role } from "@/store/uiStore";

type ProductTheme = "light" | "dark";
const THEME_STORAGE_KEY = "doorstar.product-theme";
const officeRoles: Array<{ value: Role; label: string }> = [
  { value: "sales", label: "Sales" }, { value: "technical_preparation", label: "Műszaki előkészítő" },
  { value: "order_approver", label: "Jóváhagyó" }, { value: "production_planner", label: "Termeléstervező" },
  { value: "installer", label: "Beépítő" }, { value: "warehouse_dispatch", label: "Raktár / kiszállítás" },
  { value: "reader", label: "Olvasó" }, { value: "administrator", label: "Rendszergazda" }, { value: "vezeto", label: "Régi vezetői mód" },
];
function readSavedTheme(): ProductTheme { return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }

/** Office workspace stays deliberately separate from the marker-board UI. */
export function ProductShell() {
  const { role, setRole } = useUiStore();
  const [theme, setTheme] = useState<ProductTheme>(readSavedTheme);
  useEffect(() => { window.localStorage.setItem(THEME_STORAGE_KEY, theme); }, [theme]);
  const nextTheme = theme === "light" ? "dark" : "light";
  return <div className="doorstar-product-shell" data-theme={theme}>
    <header className="doorstar-product-header no-print">
      <NavLink className="doorstar-product-brand" to="/">Doorstar</NavLink>
      <nav className="doorstar-product-nav" aria-label="Irodai navigáció">
        <NavLink to="/" end>Áttekintés</NavLink><NavLink to="/orders">Rendelések</NavLink><NavLink to="/orders/new">Sales</NavLink><NavLink to="/imports">Import Inbox</NavLink><NavLink to="/projects">Projektek</NavLink><NavLink to="/board">Üzemi tábla</NavLink>
      </nav>
      <div className="doorstar-product-tools"><button className="doorstar-theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={`${nextTheme} mód bekapcsolása`}>{theme === "light" ? "Sötét mód" : "Világos mód"}</button><label className="doorstar-role-picker"><span>Szerep</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{officeRoles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label></div>
    </header>
    <Outlet /><Toast /><ConfirmDialog />
  </div>;
}
