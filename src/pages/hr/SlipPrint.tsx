import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Payslip as Slip, SlipTemplate } from "../../lib/types";
import { useSettings } from "../../lib/hooks";
import Payslip from "../../components/Payslip";
import { Button, Skeleton } from "../../components/ui";

export default function SlipPrint() {
  const { runId } = useParams();
  const [params] = useSearchParams();
  const { firm } = useAuth();
  const { settings } = useSettings();
  const [slips, setSlips] = useState<Slip[] | null>(null);

  useEffect(() => {
    let q = supabase.from("payslips").select("*").eq("run_id", runId!);
    const emp = params.get("emp");
    if (emp) q = q.eq("employee_id", emp);
    q.then(({ data }) => setSlips((data ?? []).sort((a, b) => a.snapshot.employee.emp_code.localeCompare(b.snapshot.employee.emp_code))));
  }, [runId, params]);

  useEffect(() => {
    if (slips?.length && settings) {
      document.title = slips.length === 1 ? `Payslip-${slips[0].snapshot.employee.emp_code}-${slips[0].month.slice(0, 7)}` : `Payslips-${slips[0].month.slice(0, 7)}`;
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [slips, settings]);

  if (!slips || !settings || !firm) return <div className="p-10"><Skeleton className="h-[600px] max-w-[800px] mx-auto" /></div>;
  const tpl = (params.get("template") as SlipTemplate) || settings.slip_template;

  return (
    <div className="min-h-screen bg-canvas py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[800px] items-center justify-between px-4">
        <div><div className="font-medium">{slips.length} payslip{slips.length > 1 ? "s" : ""}</div><div className="text-[13px] text-ink-3">Choose "Save as PDF" in the print dialog to download.</div></div>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print / Save PDF</Button>
      </div>
      <div className="mx-auto max-w-[800px] space-y-8 px-4 print:space-y-0 print:px-0">
        {slips.map((s) => (
          <div key={s.id} className="slip-page">
            <Payslip firm={firm} opts={{ ...settings, slip_template: tpl }} month={s.month} slip={s.snapshot} />
          </div>
        ))}
      </div>
    </div>
  );
}
