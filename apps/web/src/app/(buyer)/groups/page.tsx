import { PageHeader } from "@/components/ui";
import { GroupInvites } from "@/components/GroupInvites";

/** Group ticket invites this account sent. Reads `groups` "mine". */
export default function GroupsPage() {
  return (
    <>
      <PageHeader
        title="Group invites"
        subtitle="Share a group ticket with a team member, and see who has claimed a seat."
      />
      <GroupInvites />
    </>
  );
}
