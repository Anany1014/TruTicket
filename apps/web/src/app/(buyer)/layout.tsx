import { Shell } from "@/components/Shell";
import type { NavItem } from "@/components/Sidebar";

/** Buyer screens: what the account holder sees for their own tickets and invites. */
const NAV: NavItem[] = [
  { href: "/tickets", label: "My tickets" },
  { href: "/groups", label: "Group invites" },
  { href: "/organiser/resale", label: "Resale market" },
  { href: "/organiser", label: "Organiser view" },
];

/**
 * Shell for the buyer screens.
 *
 * These pages read the signed-in user's own data, so they share the same frame as the
 * organiser portal: same sidebar shape, same account control, same sign-in state.
 */
export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell
      items={NAV}
      label="Your account"
      footer={{ name: "Your account", email: "Sign in to see your details", initial: "A" }}
      search="Search your tickets…"
      badge={null}
    >
      {children}
    </Shell>
  );
}
