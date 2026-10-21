import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import "./index.css";
import "./lib/install"; // listen for the install prompt from the very first load
import { AuthProvider, HOME, useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import { ToastProvider } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";
import GetApp from "./pages/GetApp";

const AdminOverview = lazy(() => import("./pages/admin/Overview"));
const AdminFirms = lazy(() => import("./pages/admin/Firms"));
const AdminFirmDetail = lazy(() => import("./pages/admin/FirmDetail"));
const HrDashboard = lazy(() => import("./pages/hr/Dashboard"));
const HrAttendance = lazy(() => import("./pages/hr/Attendance"));
const HrEmployees = lazy(() => import("./pages/hr/Employees"));
const HrBranches = lazy(() => import("./pages/hr/Branches"));
const HrEmployeeProfile = lazy(() => import("./pages/hr/EmployeeProfile"));
const HrPayroll = lazy(() => import("./pages/hr/Payroll"));
const HrSettings = lazy(() => import("./pages/hr/Settings"));
const SlipPrint = lazy(() => import("./pages/hr/SlipPrint"));
const BranchHome = lazy(() => import("./pages/branch/BranchHome"));
const MeHome = lazy(() => import("./pages/me/MeHome"));
const MeScan = lazy(() => import("./pages/me/Scan"));

function Spinner() {
  return <div className="flex min-h-[60vh] items-center justify-center text-ink-3"><Loader2 className="size-6 animate-spin" aria-label="Loading" /></div>;
}

function Gate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { session, profile, firm, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!profile) return <NoAccess reason="no-profile" />;
  if (!roles.includes(profile.role)) return <Navigate to={HOME[profile.role]} replace />;
  if (profile.role !== "superadmin" && !firm) return <NoAccess reason="suspended" />;
  return <>{children}</>;
}

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={HOME[profile.role]} replace />;
}

// Installable app (PWA). Skipped in dev so Vite hot reload is never served from cache.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/get-app" element={<GetApp />} />
              <Route element={<Gate roles={["superadmin"]}><Layout /></Gate>}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/firms" element={<AdminFirms />} />
                <Route path="/admin/firms/:id" element={<AdminFirmDetail />} />
              </Route>
              <Route element={<Gate roles={["hr"]}><Layout /></Gate>}>
                <Route path="/app" element={<HrDashboard />} />
                <Route path="/app/attendance" element={<HrAttendance />} />
                <Route path="/app/employees" element={<HrEmployees />} />
                <Route path="/app/employees/:id" element={<HrEmployeeProfile />} />
                <Route path="/app/branches" element={<HrBranches />} />
                <Route path="/app/payroll" element={<HrPayroll />} />
                <Route path="/app/settings" element={<HrSettings />} />
              </Route>
              <Route path="/app/slips/:runId" element={<Gate roles={["hr"]}><SlipPrint /></Gate>} />
              <Route path="/branch" element={<Gate roles={["branch"]}><BranchHome /></Gate>} />
              <Route path="/me" element={<Gate roles={["employee"]}><MeHome /></Gate>} />
              <Route path="/me/slips/:runId" element={<Gate roles={["employee"]}><SlipPrint /></Gate>} />
              <Route path="/scan" element={<Gate roles={["employee"]}><MeScan /></Gate>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
