import {
  AddFeatureChange,
  type AddFeatureChangeDetails,
  LocationEndChange,
} from '@apollo-annotation/shared'
import { describe, expect, it } from '@jest/globals'

import { changeNeedsApplying } from './changeNeedsApplying'

const ASSEMBLY = 'assembly-1'

function holds(assemblies: string[], features: string[]) {
  return {
    assembly: (id: string) => assemblies.includes(id),
    feature: (id: string) => features.includes(id),
  }
}

function addFeature(id: string, parentFeatureId?: string) {
  const details: AddFeatureChangeDetails = {
    addedFeature: { _id: id, refSeq: 'ctgA', min: 10, max: 20, type: 'gene' },
    parentFeatureId,
  }
  return new AddFeatureChange({
    typeName: 'AddFeatureChange',
    assembly: ASSEMBLY,
    changedIds: [parentFeatureId ?? id],
    ...details,
  })
}

describe('changeNeedsApplying', () => {
  it('applies a new top-level feature to a client that holds the assembly but not the feature', () => {
    expect(
      changeNeedsApplying(addFeature('new-gene'), holds([ASSEMBLY], [])),
    ).toBe(true)
  })

  it('ignores a new top-level feature for an assembly the client does not hold', () => {
    expect(changeNeedsApplying(addFeature('new-gene'), holds([], []))).toBe(
      false,
    )
  })

  it('applies a child feature to a client that holds the parent', () => {
    expect(
      changeNeedsApplying(
        addFeature('mrna-1', 'gene-1'),
        holds([ASSEMBLY], ['gene-1']),
      ),
    ).toBe(true)
  })

  it('ignores a child feature whose parent the client does not hold', () => {
    expect(
      changeNeedsApplying(
        addFeature('mrna-1', 'gene-1'),
        holds([ASSEMBLY], []),
      ),
    ).toBe(false)
  })

  it('applies an edit to a feature the client holds', () => {
    const edit = new LocationEndChange({
      typeName: 'LocationEndChange',
      assembly: ASSEMBLY,
      changedIds: ['gene-1'],
      featureId: 'gene-1',
      oldEnd: 20,
      newEnd: 30,
    })
    expect(changeNeedsApplying(edit, holds([ASSEMBLY], ['gene-1']))).toBe(true)
  })

  it('ignores an edit to a feature the client does not hold', () => {
    const edit = new LocationEndChange({
      typeName: 'LocationEndChange',
      assembly: ASSEMBLY,
      changedIds: ['gene-1'],
      featureId: 'gene-1',
      oldEnd: 20,
      newEnd: 30,
    })
    expect(changeNeedsApplying(edit, holds([ASSEMBLY], []))).toBe(false)
  })
})
