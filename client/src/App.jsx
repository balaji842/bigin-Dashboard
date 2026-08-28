import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Overview from "./components/Overview.jsx";
import CRMOverview from "./components/CRMOverview.jsx";
import { IconMenu } from "./components/icons.jsx";
import { api } from "./api.js";
import ClosedDealsModule from "./components/ClosedDealsModule.jsx";
import StandardPipelineModule from "./components/StandardPipelineModule.jsx";
import FYComparisonModule from "./components/FYComparisonModule.jsx";

const PAGE_TITLES = {
  "closed-deals": {
  title: "Closed Deals · Conversion",
  sub: "Fiscal-year conversion totals, month-wise trend, and donor breakdowns for closed deals.",
},
"standard-pipeline": {
  title: "Standard Pipeline",
  sub: "Open pipeline by stage, projected conversion month, and donor breakdowns.",
},
"fy-comparison": {
  title: "FY 2025-26 vs FY 2026-27",
  sub: "Side-by-side comparison of closed deals and standard pipeline across both fiscal years.",
},
  "bigin-overview": {
    title: "Bigin CRM · Live Analysis Dashboard",
    sub: "Every view here calls the Zoho Bigin API in real time — nothing is cached beyond this session.",
  },
  "crm-overview": {
    title: "CRM Analysis · Overview",
    sub: "Closed deals, standard pipeline, and donor breakdowns pulled fresh from Bigin.",
  },
};


export default function App() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState("bigin-overview");

  const loadSummary = () => {
    setLoading(true);
    setError(null);
    api
      .summary()
      .then((data) => {
        setSummary(data);
        setLastUpdated(new Date().toLocaleTimeString());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const pageInfo = PAGE_TITLES[activePage] || PAGE_TITLES["bigin-overview"];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        lastUpdated={lastUpdated}
        onRefresh={loadSummary}
        loading={loading}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          setSidebarOpen(false);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-navy-900 p-1.5 -ml-1.5"
            aria-label="Open menu"
          >
            <IconMenu className="w-5 h-5" />
          </button>
          <p className="font-display font-bold text-navy-900">
            Bigin<span className="text-pink-500">.</span>Analysis
          </p>
        </div>

        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full">
          <header className="mb-5 sm:mb-6 hidden md:block">
            <h1 className="font-display text-2xl font-bold text-navy-900">{pageInfo.title}</h1>
            <p className="text-sm text-slate-500">{pageInfo.sub}</p>
          </header>

          {activePage === "bigin-overview" && (
            <>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4 border border-red-100 mb-5 break-words">
                  Couldn't load summary: {error}. Check your server/.env
                  credentials and that the API server is running on port 4000.
                </div>
              )}
              {loading && !summary ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
                  Pulling live data from Bigin…
                </div>
              ) : (
                <Overview data={summary} />
              )}
            </>
          )}

          {activePage === "crm-overview" && <CRMOverview />}
          {activePage === "standard-pipeline" && <StandardPipelineModule />}
          {activePage === "fy-comparison" && <FYComparisonModule />}
          {activePage === "closed-deals" && <ClosedDealsModule />}
        </main>

        <footer className="border-t border-slate-200 px-4 sm:px-6 md:px-8 py-3 max-w-6xl mx-auto w-full flex flex-col sm:flex-row gap-1 sm:gap-0 items-start sm:items-center justify-between text-xs text-slate-400">
          <span>{lastUpdated ? `Last updated: ${lastUpdated}` : "Not yet loaded"}</span>
          <span>NSNOP Bigin Analysis Dashboard</span>
        </footer>
      </div>
    </div>
  );
}