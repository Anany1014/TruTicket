import { Sidebar, type NavItem } from "@/components/Sidebar";
import { MockBadge } from "@/components/MockBadge";
import { LiveEventDetailLink } from "@/components/LiveEventDetailLink";
import { AccountChip } from "@/components/AccountChip";

/** The 10 organiser screens (PLAN §4). */
const NAV: NavItem[] = [
  { href: "/organiser", label: "Overview" },
  { href: "/organiser/create", label: "Create event" },
  { href: "/organiser/inventory", label: "Ticket inventory" },
  { href: "/organiser/resale", label: "Resale policy" },
  { href: "/organiser/fraud", label: "Fraud monitoring" },
  { href: "/organiser/gate", label: "Gate staff" },
  { href: "/organiser/payouts", label: "Payouts" },
  { href: "/organiser/organisation", label: "Organisation" },
  { href: "/organiser/verification", label: "Verification" },
  // Not organiser screens: these switch to the buyer shell. Kept here so the whole
  // demo is reachable from one menu.
  { href: "/tickets", label: "My tickets" },
  { href: "/groups", label: "Group invites" },
];

/**
 * Shell for all organiser screens: sidebar, top bar, page content.
 *
 * The "Event detail" link is not in NAV. It resolves at runtime to the first
 * published event the backend knows about, so it always lands on a live screen.
 */
export default function OrganiserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar
        items={NAV}
        label="Organiser navigation"
        footer={{ name: "Organiser", email: "organizer@example.com", initial: "O" }}
        liveHref="/organiser/events"
        liveLink={<LiveEventDetailLink mockHref="/organiser/events/sunset-2025" />}
      />
      <div className="main">
        <header className="topbar">
          <div className="search">Search events, tickets, orders…</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
            <MockBadge label="Some panels are mock" />
            <span className="bell" aria-label="Notifications">●</span>
            <AccountChip />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
