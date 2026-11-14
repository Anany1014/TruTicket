import { PageHeader } from "@/components/ui";
import { MockBadge } from "@/components/MockBadge";
import { CreateEventWizard } from "@/components/CreateEventWizard";

/**
 * Create event wizard (PRD screen 16).
 *
 * The final submit calls the `events` "create" endpoint, which creates a DRAFT.
 * It needs a signed-in, verified organiser, so it needs the access token from the
 * sign-in flow. Web sign-in is still an open decision for the project owner.
 */
export default function CreateEvent() {
  return (
    <>
      <PageHeader
        title="Create new event"
        subtitle="Five steps. Your draft is saved, and nothing goes live until an admin approves it."
        actions={<MockBadge label="Ticket types not sent" />}
      />
      <CreateEventWizard />
    </>
  );
}
