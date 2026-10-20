import { ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui";

export default function NoAccess({ reason }: { reason: "no-profile" | "suspended" }) {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-rose-50 text-bad"><ShieldAlert className="size-6" /></div>
        <h1 className="text-[20px] font-medium">{reason === "suspended" ? "Workspace suspended" : "No access"}</h1>
        <p className="mt-2 text-ink-3">
          {reason === "suspended"
            ? "This firm's workspace has been suspended by the platform administrator. Contact them to restore access."
            : "This account isn't linked to any firm. Ask your platform administrator to create your firm login."}
        </p>
        <Button className="mt-6" variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
