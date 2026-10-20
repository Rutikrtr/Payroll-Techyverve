import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";

const AdminOverview = lazy(() => import("./pages/admin/Overview"));
const AdminFirms = lazy(() => import("./pages/admin/Firms"));
const AdminFirmDetail = lazy(() => import("./pages/admin/FirmDetail"));
const HrDashboard = lazy(() => import("./pages/hr/Dashboard"));
const HrAttendance = lazy(() => import("./pages/hr/Attendance"));
const HrEmployees = lazy(() => import("./pages/hr/Employees"));
const HrPayroll = lazy(() => import("./pages/hr/Payroll"));
const HrSettings = lazy(() => import("./pages/hr/Settings"));
const SlipPrint = lazy(() => import("./pages/hr/SlipPrint"));

function Spinner() {
  return <div className="flex min-h-[60vh] items-center justify-center text-ink-3"><Loader2 className="size-6 animate-spin" aria-label="Loading" /></div>;
}

function Gate({ role, children }: { role: "superadmin" | "hr"; children: React.ReactNode }) {
  const { session, profile, firm, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <NoAccess reason="no-profile" />;
  if (profile.role !== role) return <Navigate to={profile.role === "superadmin" ? "/admin" : "/app"} replace />;
  if (role === "hr" && !firm) return <NoAccess reason="suspended" />;
  return <>{children}</>;
}

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={profile?.role === "superadmin" ? "/admin" : "/app"} replace />;
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
              <Route element={<Gate role="superadmin"><Layout /></Gate>}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/firms" element={<AdminFirms />} />
                <Route path="/admin/firms/:id" element={<AdminFirmDetail />} />
              </Route>
              <Route element={<Gate role="hr"><Layout /></Gate>}>
                <Route path="/app" element={<HrDashboard />} />
                <Route path="/app/attendance" element={<HrAttendance />} />
                <Route path="/app/employees" element={<HrEmployees />} />
                <Route path="/app/payroll" element={<HrPayroll />} />
                <Route path="/app/settings" element={<HrSettings />} />
              </Route>
              <Route path="/app/slips/:runId" element={<Gate role="hr"><SlipPrint /></Gate>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
