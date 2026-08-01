import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useUiStore, type Role } from "@/store/uiStore";

type ProductTheme = "light" | "dark";
type OfficeRoute = "overview" | "orders" | "sales" | "imports" | "projects" | "board";

interface OfficeNavItem {
  route: OfficeRoute;
  label: string;
  shortLabel: string;
  to: string;
}

const THEME_STORAGE_KEY = "doorstar.product-theme";
const PHONE_QUERY = "(max-width: 620px)";
const officeNavigation: OfficeNavItem[] = [
  { route: "overview", label: "Áttekintés", shortLabel: "Áttekintés", to: "/" },
  { route: "orders", label: "Rendelések", shortLabel: "Rendelések", to: "/orders" },
  { route: "sales", label: "Sales", shortLabel: "Sales", to: "/orders/new" },
  { route: "imports", label: "Import Inbox", shortLabel: "Import", to: "/imports" },
  { route: "projects", label: "Projektek", shortLabel: "Projektek", to: "/projects" },
  { route: "board", label: "Üzemi tábla", shortLabel: "Üzemi tábla", to: "/board" },
];
const phonePrimaryRoutes: OfficeRoute[] = ["overview", "orders", "sales", "projects"];
const phoneMoreRoutes: OfficeRoute[] = ["imports", "board"];
const officeRoles: Array<{ value: Role; label: string }> = [
  { value: "sales", label: "Sales" }, { value: "technical_preparation", label: "Műszaki előkészítő" },
  { value: "order_approver", label: "Jóváhagyó" }, { value: "production_planner", label: "Termeléstervező" },
  { value: "installer", label: "Beépítő" }, { value: "warehouse_dispatch", label: "Raktár / kiszállítás" },
  { value: "reader", label: "Olvasó" }, { value: "administrator", label: "Rendszergazda" }, { value: "vezeto", label: "Régi vezetői mód" },
];

function readSavedTheme(): ProductTheme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function usePhoneMode() {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia?.(PHONE_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY);
    if (!query) return undefined;
    const update = (event: MediaQueryListEvent) => setIsPhone(event.matches);
    setIsPhone(query.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener?.(update);
    return () => query.removeListener?.(update);
  }, []);
  return isPhone;
}

/** Route matching is explicit so /orders/new activates Sales, never Orders. */
export function officeRouteIsActive(route: OfficeRoute, pathname: string) {
  if (route === "overview") return pathname === "/";
  if (route === "sales") return pathname === "/orders/new";
  if (route === "orders") return pathname === "/orders" || (/^\/orders\//.test(pathname) && pathname !== "/orders/new");
  if (route === "imports") return pathname === "/imports" || pathname.startsWith("/imports/");
  if (route === "projects") return pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === "/board";
}

function OfficeNavLink({ item, pathname, compact = false, exposeCurrent = true, onClick }: {
  item: OfficeNavItem;
  pathname: string;
  compact?: boolean;
  exposeCurrent?: boolean;
  onClick?: () => void;
}) {
  const active = officeRouteIsActive(item.route, pathname);
  const nestedWorkspaceOwnsCurrent = (item.route === "orders" && pathname.startsWith("/orders/") && pathname !== "/orders/new")
    || (item.route === "projects" && pathname.startsWith("/projects/"));
  return <Link
    to={item.to}
    className={active ? "is-active" : undefined}
    aria-current={active && exposeCurrent && !nestedWorkspaceOwnsCurrent ? "page" : undefined}
    onClick={onClick}
  >{compact ? item.shortLabel : item.label}</Link>;
}

function ThemeAndRoleControls({ theme, nextTheme, role, setTheme, setRole, phone = false }: {
  theme: ProductTheme;
  nextTheme: ProductTheme;
  role: Role;
  setTheme: (theme: ProductTheme) => void;
  setRole: (role: Role) => void;
  phone?: boolean;
}) {
  return <div className={phone ? "doorstar-phone-tools" : "doorstar-product-tools"}>
    <button className="doorstar-theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={`${nextTheme} mód bekapcsolása`}>
      {theme === "light" ? "Sötét mód" : "Világos mód"}
    </button>
    <label className="doorstar-role-picker"><span>Szerep</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{officeRoles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
  </div>;
}

/** Office workspace stays deliberately separate from the marker-board UI. */
export function ProductShell() {
  const { role, setRole } = useUiStore();
  const location = useLocation();
  const isPhone = usePhoneMode();
  const [theme, setTheme] = useState<ProductTheme>(readSavedTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { window.localStorage.setItem(THEME_STORAGE_KEY, theme); }, [theme]);
  useEffect(() => { setMoreOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [moreOpen]);

  const nextTheme = theme === "light" ? "dark" : "light";
  const primaryItems = officeNavigation.filter((item) => phonePrimaryRoutes.includes(item.route));
  const moreItems = officeNavigation.filter((item) => phoneMoreRoutes.includes(item.route));
  const moreRouteActive = moreItems.some((item) => officeRouteIsActive(item.route, location.pathname));

  return <div className="doorstar-product-shell" data-theme={theme} data-phone-mode={isPhone ? "true" : "false"}>
    <header className="doorstar-product-header no-print">
      <Link className="doorstar-product-brand" to="/">Doorstar</Link>
      {isPhone ? <span className="doorstar-phone-context">Irodai projektek</span> : <>
        <nav className="doorstar-product-nav" aria-label="Irodai navigáció">
          {officeNavigation.map((item) => <OfficeNavLink key={item.route} item={item} pathname={location.pathname} />)}
        </nav>
        <ThemeAndRoleControls theme={theme} nextTheme={nextTheme} role={role} setTheme={setTheme} setRole={setRole} />
      </>}
    </header>

    <Outlet /><Toast /><ConfirmDialog />

    {isPhone && <>
      {moreOpen && <aside className="doorstar-phone-more-panel no-print" id="doorstar-phone-more-panel" aria-label="További irodai beállítások">
        <nav aria-label="További irodai navigáció">
          {moreItems.map((item) => <OfficeNavLink key={item.route} item={item} pathname={location.pathname} onClick={() => setMoreOpen(false)} />)}
        </nav>
        <ThemeAndRoleControls phone theme={theme} nextTheme={nextTheme} role={role} setTheme={setTheme} setRole={setRole} />
      </aside>}
      <nav className="doorstar-phone-nav no-print" aria-label="Telefonos irodai navigáció">
        {primaryItems.map((item) => <OfficeNavLink key={item.route} item={item} pathname={location.pathname} compact />)}
        <button
          ref={moreButtonRef}
          type="button"
          className={moreRouteActive ? "is-active" : undefined}
          aria-current={moreRouteActive && !moreOpen ? "page" : undefined}
          aria-expanded={moreOpen}
          aria-controls="doorstar-phone-more-panel"
          onClick={() => setMoreOpen((open) => !open)}
        >Továbbiak</button>
      </nav>
    </>}
  </div>;
}
