import { Sidebar, type NavItem } from "@/components/Sidebar";
import { AccountChip } from "@/components/AccountChip";
import { MockBadge } from "@/components/MockBadge";

/**
 * The shared page frame: side navigation, top bar, content column.
 *
 * Both the organiser portal and the buyer screens use it, so the account control and
 * the sign-in state behave the same everywhere instead of being re-implemented per
 * section.
 */
export function Shell({
  items,
  label,
  footer,
  search,
  badge,
  liveHref,
  liveLink,
  children,
}: {
  items: NavItem[];
  label: string;
  footer: { name: string; email: string; initial: string };
  search: string;
  /**
   * Badge in the top bar. Leave it undefined for the "Some panels are mock" default,
   * or pass `null` to show no badge at all (the buyer screens have nothing mock on them).
   */
  badge?: React.ReactNode;
  liveHref?: string;
  liveLink?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <Sidebar items={items} label={label} footer={footer} liveHref={liveHref} liveLink={liveLink} />
      <div className="main">
        <header className="topbar">
          <div className="search">{search}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
            {badge === undefined ? <MockBadge label="Some panels are mock" /> : badge}
            <span className="bell" aria-label="Notifications">
              ●
            </span>
            <AccountChip />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
