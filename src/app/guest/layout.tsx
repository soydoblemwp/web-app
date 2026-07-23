import { GuestHeader } from "@/components/guest/guest-header";
import { GuestNav } from "@/components/guest/guest-nav";

/**
 * Guest shell — intentionally outside the (dashboard) route group and the
 * proxy.ts matcher, so it never requires a session. No project, no user,
 * no DB reads/writes happen anywhere in this tree.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <GuestHeader />
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <GuestNav />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
