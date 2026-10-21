import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, IndianRupee, Plus, UserCheck, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase";
import type { Firm } from "../../lib/types";
import { Badge, Button, Empty, PageHeader, Skeleton } from "../../components/ui";
import { compact, initials, money } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import InstallApp from "../../components/InstallApp";

type Stat = { firm_id: string; employees: number; present_today: number; last_payroll: string | null; last_net: number | null };

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-xl bg-wine-700 p-5 text-white shadow-card" : "card p-5"}>
      <div className="flex items-center justify-between">
        <span className={accent ? "text-[13px] text-white/70" : "text-[13px] text-ink-3"}>{label}</span>
        <span className={accent ? "text-white/70" : "text-ink-4"}>{icon}</span>
      </div>
      <div className="num mt-3 font-display text-[32px] font-medium leading-none tracking-[-0.03em]">{value}</div>
      <div className={accent ? "mt-2 text-[12px] text-white/60" : "mt-2 text-[12px] text-ink-3"}>{sub}</div>
    </div>
  );
}

export default function Overview() {
  const { profile } = useAuth();
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    Promise.all([supabase.from("firms").select("*").order("created_at", { ascending: false }), supabase.rpc("platform_stats")])
      .then(([f, s]) => { setFirms(f.data ?? []); setStats((s.data as Stat[]) ?? []); });
  }, []);

  const byId = Object.fromEntries(stats.map((s) => [s.firm_id, s]));
  const totalEmp = stats.reduce((t, s) => t + Number(s.employees), 0);
  const present = stats.reduce((t, s) => t + Number(s.present_today), 0);
  const payroll = stats.reduce((t, s) => t + Number(s.last_net ?? 0), 0);
  const active = (firms ?? []).filter((f) => f.status === "active").length;
  const chart = (firms ?? []).map((f) => ({ name: f.name.length > 14 ? f.name.slice(0, 13) + "…" : f.name, employees: Number(byId[f.id]?.employees ?? 0) }))
    .sort((a, b) => b.employees - a.employees).slice(0, 8);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greet}, ${profile?.full_name?.split(" ")[0] || "Admin"}`} subtitle="Here's how every firm on the platform is doing today."
        actions={<Link to="/admin/firms"><Button icon={<Plus className="size-4" />}>New firm</Button></Link>} />

      {firms === null ? (
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
      ) : (
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          <Kpi accent label="Firms on platform" value={String(firms.length)} sub={`${active} active · ${firms.length - active} suspended`} icon={<Building2 className="size-5" />} />
          <Kpi label="Employees managed" value={compact(totalEmp)} sub="Active across all firms" icon={<Users className="size-5" />} />
          <Kpi label="Present today" value={compact(present)} sub={totalEmp ? `${Math.round((present / totalEmp) * 100)}% platform attendance` : "No attendance yet"} icon={<UserCheck className="size-5" />} />
          <Kpi label="Latest net payroll" value={money(payroll)} sub="Sum of each firm's last finalized run" icon={<IndianRupee className="size-5" />} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div><h2 className="text-[16px] font-medium">Headcount by firm</h2><p className="text-[13px] text-ink-3">Top 8 firms by active employees</p></div>
          </div>
          <div className="mt-4 h-[260px]">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eeece9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#6b7c99", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#6b7c99", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "rgba(123,30,58,.06)" }} contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ef", fontSize: 13 }} />
                  <Bar dataKey="employees" name="Employees" fill="#7b1e3a" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty icon={<Building2 className="size-6" />} title="No data yet" body="Headcount appears once firms add employees." />}
          </div>
        </div>

        <div className="card lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-[16px] font-medium">Recently onboarded</h2>
            <Link to="/admin/firms" className="inline-flex items-center gap-1 text-[13px] font-medium text-wine-700 hover:underline">View all <ArrowUpRight className="size-3.5" /></Link>
          </div>
          <ul className="flex-1 divide-y divide-line">
            {(firms ?? []).slice(0, 6).map((f) => (
              <li key={f.id}>
                <Link to={`/admin/firms/${f.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas/60">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-wine-50 text-[13px] font-semibold text-wine-700">{initials(f.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{f.name}</div>
                    <div className="truncate text-[12px] text-ink-3">{byId[f.id]?.employees ?? 0} employees · {f.city || "—"}</div>
                  </div>
                  <Badge dot tone={f.status === "active" ? "ok" : "bad"}>{f.status === "active" ? "Active" : "Suspended"}</Badge>
                </Link>
              </li>
            ))}
            {firms?.length === 0 && <li className="px-5 py-8 text-center text-ink-3">No firms yet.</li>}
          </ul>
        </div>
      </div>
      <div className="mt-4"><InstallApp share /></div>
    </>
  );
}
