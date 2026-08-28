import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import StatCard from "./StatCard.jsx";
import {
  IconTarget,
  IconCheckCircle,
  IconTrendingUp,
  IconWallet,
  IconBuilding,
  IconUsers,
  IconClipboard,
  IconPhone,
} from "./icons.jsx";

const PIE_COLORS = ["#e94f8a", "#22316b", "#f172a1", "#2f4086", "#f79cbe", "#0b1230"];

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 min-w-0">
      <p className="font-display font-semibold text-navy-900 mb-4 text-sm sm:text-base">
        {title}
      </p>
      {children}
    </div>
  );
}

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function topWithOther(list, n = 8) {
  if (!list || list.length <= n) return list || [];
  const top = list.slice(0, n);
  const rest = list.slice(n);
  const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
  return [...top, { name: `Other (${rest.length})`, value: otherValue }];
}

function StageTable({ dealsByStage, dealValueByStage, totalPipelineValue }) {
  const valueByName = Object.fromEntries(
    (dealValueByStage || []).map((d) => [d.name, d.value])
  );

  const rows = (dealsByStage || []).map((d) => {
    const amount = valueByName[d.name] || 0;
    const pct = totalPipelineValue ? (amount / totalPipelineValue) * 100 : 0;
    return { name: d.name, count: d.value, amount, pct };
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-navy-900 text-white px-4 sm:px-5 py-3">
        <p className="font-display font-semibold text-sm">Pipeline by stage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 sm:px-5 py-3 font-semibold">Stage</th>
              <th className="px-4 sm:px-5 py-3 font-semibold text-right">Deals</th>
              <th className="px-4 sm:px-5 py-3 font-semibold text-right">Value</th>
              <th className="px-4 sm:px-5 py-3 font-semibold text-right">% of pipeline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 sm:px-5 py-2.5 text-navy-900 font-medium whitespace-nowrap">
                  {r.name}
                </td>
                <td className="px-4 sm:px-5 py-2.5 text-right text-slate-600">{r.count}</td>
                <td className="px-4 sm:px-5 py-2.5 text-right text-slate-600 whitespace-nowrap">
                  {money(r.amount)}
                </td>
                <td className="px-4 sm:px-5 py-2.5 text-right text-pink-600 font-semibold">
                  {r.pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Overview({ data }) {
  if (!data) return null;
  const { counts, value, charts } = data;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Open Deals" value={counts.openDeals} icon={IconTarget} accent="pink" />
        <StatCard label="Won Deals" value={counts.wonDeals} icon={IconCheckCircle} accent="emerald" />
        <StatCard
          label="Open Pipeline Value"
          value={money(value.totalPipelineValue)}
          icon={IconTrendingUp}
          accent="pink"
        />
        <StatCard
          label="Won Value"
          value={money(value.totalWonValue)}
          icon={IconWallet}
          accent="emerald"
        />
        <StatCard label="Accounts" value={counts.accounts} icon={IconBuilding} accent="navy" />
        <StatCard label="Contacts" value={counts.contacts} icon={IconUsers} accent="navy" />
        <StatCard label="Tasks" value={counts.tasks} icon={IconClipboard} accent="amber" />
        <StatCard
          label="Calls + Meetings"
          value={counts.calls + counts.meetings}
          icon={IconPhone}
          accent="amber"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
        <ChartCard title="Deals by stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topWithOther(charts.dealsByStage, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 10 }}
                interval={0}
              />
              <Tooltip />
              <Bar dataKey="value" fill="#e94f8a" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Deal value by stage (₹)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topWithOther(charts.dealValueByStage, 8)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9 }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} width={40} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="value" fill="#22316b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <StageTable
        dealsByStage={charts.dealsByStage}
        dealValueByStage={charts.dealValueByStage}
        totalPipelineValue={value.totalPipelineValue}
      />

      <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
        <ChartCard title="Accounts by industry">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={charts.accountsByIndustry.slice(0, 6)}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={(d) => d.name}
              >
                {charts.accountsByIndustry.slice(0, 6).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Activities mix">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={charts.activitiesByType}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={(d) => `${d.name}: ${d.value}`}
              >
                {charts.activitiesByType.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}