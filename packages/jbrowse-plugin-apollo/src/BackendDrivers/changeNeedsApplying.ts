import type { FeatureChange } from '@apollo-annotation/common'
import { isAddFeatureChange } from '@apollo-annotation/shared'

/**
 * Whether a feature change received from the server concerns data this client
 * holds. A feature added at the top level has no parent to look for, so the
 * assembly alone decides.
 */
export function changeNeedsApplying(
  change: FeatureChange,
  holds: {
    assembly: (assemblyId: string) => boolean
    feature: (featureId: string) => boolean
  },
): boolean {
  const { assembly, changedIds } = change
  if (!holds.assembly(assembly)) {
    return false
  }
  if (
    isAddFeatureChange(change) &&
    change.changes.some(({ parentFeatureId }) => !parentFeatureId)
  ) {
    return true
  }
  return changedIds.some((changedId) => holds.feature(changedId))
}
