import { Link } from "react-router-dom";
import { useProductionOrders } from "@/services/production/hooks";
import type { OrderIntakeStage, OrderRevisionStatus } from "@/services/production/types";

const statusLabel: Record<OrderRevisionStatus, string> = {
  DRAFT: "Piszkozat",
  REVIEW: "Ellenőrzés alatt",
  APPROVED: "Jóváhagyott",
  SUPERSEDED: "Leváltott",
};
const intakeLabel: Record<OrderIntakeStage, string> = {
  SALES_DRAFT: "Sales piszkozat", SALES_DOCUMENTS_RECEIVED: "Dokumentumok átadva", SURVEY_PENDING: "Felmérésre vár", SURVEY_COMPLETED: "Felmérés kész", SURVEY_EXCEPTION_REVIEW: "Felmérési kivétel", TECHNICAL_PREPARATION: "Műszaki előkészítés",
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "Nincs megadva";
}

export function OrdersPage() {
  const { data: orders = [], isLoading, isError } = useProductionOrders();
  return <main className="orders-page"><div className="orders-content">
    <header className="orders-hero"><div><p>Rendelések</p><h1>Rendelésregiszter</h1><span>Az aktuális rendelési revíziók és a hozzájuk kapcsolt projektek.</span></div><Link className="doorstar-home-primary-action" to="/orders/new">Új rendelés felvétele</Link></header>
    {isLoading && <div className="orders-state">Rendelések betöltése…</div>}
    {isError && <div className="orders-state">A rendelésregiszterhez a termelési szolgáltatás elérése szükséges.</div>}
    {!isLoading && !isError && orders.length === 0 && <div className="orders-state">Még nincs felvett rendelés. Az elsőt az „Új rendelés felvétele” gombbal hozhatod létre.</div>}
    {!isLoading && !isError && orders.length > 0 && <section className="orders-list" aria-label="Aktív rendelések">
      {orders.map((order) => <Link className="order-register-card" to={`/orders/${encodeURIComponent(order.projectKey)}`} key={order.projectKey}>
        <div className="order-register-title"><div><span>{order.projectNum ?? "Projekt"}</span><h2>{order.customerName}</h2></div><div className="order-register-states"><b className="order-intake-stage">{intakeLabel[order.intakeStage]}</b><b className={`order-status order-status-${order.status.toLowerCase()}`}>{statusLabel[order.status]}</b></div></div>
        <div className="order-register-data"><div><span>Kapcsolt projekt</span><strong>{order.projectName}</strong></div><div><span>Revízió</span><strong>R{String(order.revision).padStart(2, "0")}</strong></div><div><span>Pozíció</span><strong>{order.positionCount} db</strong></div><div><span>Vállalt szállítás</span><strong>{formatDate(order.expectedDelivery)}</strong></div></div>
      </Link>)}
    </section>}
  </div></main>;
}
