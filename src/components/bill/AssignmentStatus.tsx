import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';

type Props = {
  // Names of the participants currently assigned to a line item, in
  // sortOrder. Empty means unassigned.
  names: string[];
};

// Renders the exact three assignment states from spec section 13.13. The
// "one-person state" is literally the participant's own name (no separate
// copy key) — see the spec note next to that row.
export function AssignmentStatus({ names }: Props) {
  if (names.length === 0) {
    return <StatusBadge label={copy.assignments.noAssignmentState} tone="warning" />;
  }

  if (names.length === 1) {
    return <StatusBadge label={names[0] ?? ''} tone="success" />;
  }

  return (
    <StatusBadge
      label={copy.assignments.multiPersonState.replace('{count}', String(names.length))}
      tone="success"
    />
  );
}
