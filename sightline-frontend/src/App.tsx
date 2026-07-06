import type { ReactNode } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";
import { useHashRoute } from "./hooks/useHashRoute";
import { TabBar } from "./features/tabs/TabBar";
import { SamplesView } from "./features/samples/SamplesView";
import { BorrowersList } from "./features/borrowers/BorrowersList";
import { BorrowerDetail } from "./features/borrowers/BorrowerDetail";
import { UnderReviewView } from "./features/queue/UnderReviewView";
import { DeclinedView } from "./features/queue/DeclinedView";

// Thin tab shell. Hash-based routing (see useHashRoute) means the four tabs +
// the borrower detail view are all deep-linkable and survive reloads. The
// header (logo + EU AI Act pill) stays visible across every tab; each tab
// renders its own inner shell below the TabBar.
export default function App() {
  const { route, navigate } = useHashRoute();

  let view: ReactNode;
  if (route.tab === "samples") {
    view = <SamplesView />;
  } else if (route.tab === "borrowers" && route.borrowerId) {
    view = (
      <BorrowerDetail
        id={route.borrowerId}
        onBack={() => navigate("#borrowers")}
      />
    );
  } else if (route.tab === "borrowers") {
    view = (
      <BorrowersList onOpen={(id) => navigate(`#borrowers/${id}`)} />
    );
  } else if (route.tab === "review") {
    view = <UnderReviewView />;
  } else if (route.tab === "declined") {
    view = <DeclinedView />;
  } else {
    view = <SamplesView />;
  }

  return (
    <div className="min-h-dvh bg-canvas p-4 font-sans text-ink sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold">
            <ScrollText size={22} className="text-canvas" />
          </div>
          <div>
            <div className="font-serif text-[22px] font-semibold tracking-wide">
              Sightline
            </div>
            <div className="text-xs text-muted">
              SME credit copilot — explainable by design
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] text-sub">
          <ShieldCheck size={13} className="text-gold" />
          Explainable · human-in-the-loop · EU AI Act ready
        </div>
      </header>
      <TabBar current={route.tab} onSelect={navigate} />
      <div className="mt-6">{view}</div>
    </div>
  );
}
