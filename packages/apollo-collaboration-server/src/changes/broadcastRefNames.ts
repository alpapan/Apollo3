import type { FeatureChange } from '@apollo-annotation/common'
import type {
  FeatureDocument,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import { isAddFeatureChange } from '@apollo-annotation/shared'
import type { Model } from 'mongoose'

/**
 * The names of the reference sequences whose channels receive a feature
 * change. Resolved before the change is applied, so that features the change
 * deletes can still be looked up. A feature the change adds is not stored yet,
 * so its reference sequence is read from the change itself.
 */
export async function resolveBroadcastRefNames(
  change: FeatureChange,
  models: {
    featureModel: Model<FeatureDocument>
    refSeqModel: Model<RefSeqDocument>
  },
): Promise<string[]> {
  const { featureModel, refSeqModel } = models
  const refNames = new Set<string>()
  for (const changedId of change.changedIds) {
    const featureDoc = await featureModel.findOne({ allIds: changedId }).exec()
    if (featureDoc) {
      const refSeqDoc = await refSeqModel.findById(featureDoc.refSeq).exec()
      if (refSeqDoc) {
        refNames.add(refSeqDoc.name)
      }
    }
  }
  if (isAddFeatureChange(change)) {
    for (const { addedFeature } of change.changes) {
      const refSeqDoc = await refSeqModel.findById(addedFeature.refSeq).exec()
      if (refSeqDoc) {
        refNames.add(refSeqDoc.name)
      }
    }
  }
  return [...refNames]
}
