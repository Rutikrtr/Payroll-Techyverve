import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { supabase, adminFirm } from "../../lib/supabase";
import type { Firm } from "../../lib/types";
import { Badge, Button, Empty, Modal, PageHeader, Skeleton, useToast } from "../../components/ui";
import FirmForm, { emptyFirm, type FirmDraft } from "./FirmForm";
import { dateLabel, initials } from "../../lib/format";

type Stat = { firm_id: string; employees: number; present_today: number; last_payroll: string | null; last_net: number | null };

export default function Firms() {
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FirmDraft>(emptyFirm);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  async function load() {
    const [{ data: f }, { data: s }] = await Promise.all([
      supabase.from("firms").select("*").order("created_at", { ascending: false }),
      supabase.rpc("platform_stats"),
    ]);
    setFirms(f ?? []);
    setStats(Object.fromEntries(((s as Stat[]) ?? []).map((x) => [x.firm_id, x])));
  }
  useEffect(() => { load(); }, []);

  const list = useMemo(() => (firms ?? []).filter((f) =>
    [f.name, f.city, f.hr_email, f.industry].some((v) => v?.toLowerCase().includes(q.toLowerCase()))), [firms, q]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "" ? null : v]));
      const { firm } = await adminFirm<{ firm: Firm }>({ action: "create", firm: clean, hr_password: password });
      toast("ok", `${firm.name} created. HR can now sign in with ${firm.hr_email}.`);
      setOpen(false); setDraft(emptyFirm); setPassword("");
      nav(`/admin/firms/${firm.id}`);
    } catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Firms" subtitle="Every firm gets its own isolated payroll workspace and a single HR login."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New firm</Button>} />

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="size-4 text-ink-4" aria-hidden />
          <input aria-label="Search firms" className="h-8 flex-1 bg-transparent outline-none placeholder:text-ink-4" placeholder="Search by name, city, HR email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {firms === null ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.length === 0 ? (
          <Empty icon={<Building2 className="size-6" />} title={q ? "No matching firms" : "No firms yet"}
            body={q ? "Try a different search." : "Create your first firm to give its HR team a payroll workspace."}
            action={!q && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New firm</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr>
                <th className="th">Firm</th><th className="th">HR login</th><th className="th text-right">Employees</th>
                <th className="th">Last payroll</th><th className="th">Status</th><th className="th w-10" />
              </tr></thead>
              <tbody>
                {list.map((f) => {
                  const s = stats[f.id];
                  return (
                    <tr key={f.id} className="group cursor-pointer hover:bg-canvas/60" onClick={() => nav(`/admin/firms/${f.id}`)}>
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-lg bg-wine-50 text-[13px] font-semibold text-wine-700">{initials(f.name)}</div>
                          <div>
                            <Link to={`/admin/firms/${f.id}`} className="font-medium hover:text-wine-700" onClick={(e) => e.stopPropagation()}>{f.name}</Link>
                            <div className="text-[12px] text-ink-3">{[f.multi_branch ? "Multi-branch" : "Single branch", f.industry, f.city].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td text-ink-2">{f.hr_email}</td>
                      <td className="td num text-right">{s?.employees ?? 0}<span className="text-ink-4"> / {f.employee_limit}</span></td>
                      <td className="td text-ink-2">{s?.last_payroll ? dateLabel(s.last_payroll).slice(3) : "—"}</td>
                      <td className="td"><Badge dot tone={f.status === "active" ? "ok" : "bad"}>{f.status === "active" ? "Active" : "Suspended"}</Badge></td>
                      <td className="td"><ChevronRight className="size-4 text-ink-4 group-hover:text-ink" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} wide title="Create a firm" description="Fill in the company details and its HR login credentials."
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="firm-create" loading={busy}>Create firm</Button>
        </>}>
        <form id="firm-create" onSubmit={create}>
          <FirmForm value={draft} onChange={setDraft} showHr={{ password, setPassword }} />
        </form>
      </Modal>
    </>
  );
}
