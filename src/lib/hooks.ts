import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { AttStatus, Employee, FirmSettings } from "./types";
import type { Tone } from "../components/ui";

export function useSettings() {
  const [settings, setSettings] = useState<FirmSettings | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("firm_settings").select("*").maybeSingle();
    setSettings(data);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { settings, setSettings, reload };
}

export function useEmployees(activeOnly = false) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const reload = useCallback(async () => {
    let q = supabase.from("employees").select("*").order("emp_code");
    if (activeOnly) q = q.eq("status", "active");
    const { data } = await q;
    setEmployees(data ?? []);
  }, [activeOnly]);
  useEffect(() => { reload(); }, [reload]);
  return { employees, reload };
}

export const STATUS: Record<AttStatus, { label: string; short: string; tone: Tone; color: string }> = {
  present:      { label: "Present",      short: "P",  tone: "ok",      color: "#12805c" },
  absent:       { label: "Absent",       short: "A",  tone: "bad",     color: "#c2264b" },
  half_day:     { label: "Half day",     short: "HD", tone: "warn",    color: "#b45309" },
  paid_leave:   { label: "Paid leave",   short: "PL", tone: "iris",    color: "#4b5bfc" },
  unpaid_leave: { label: "Unpaid leave", short: "UL", tone: "wine",    color: "#8a2546" },
  holiday:      { label: "Holiday",      short: "H",  tone: "neutral", color: "#a4acc4" },
  week_off:     { label: "Week off",     short: "WO", tone: "neutral", color: "#a4acc4" },
};
