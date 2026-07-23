"use client";

import { Card, CardContent } from "@/components/ui/card";
import { guestNavGroups } from "@/lib/navigation";
import { AccountGateNavItem } from "@/components/guest/account-gate";

/**
 * Self-contained so the icon components never cross the server/client
 * boundary as props (React forbids passing raw function values from a
 * Server Component into a Client Component) — this component imports the
 * nav config itself, same as GuestNav does.
 */
export function GuestRestrictedGrid() {
  const restricted = guestNavGroups[1].items;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {restricted.map((item) => (
        <Card key={item.label}>
          <CardContent className="py-2">
            <AccountGateNavItem label={item.label} icon={item.icon} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
