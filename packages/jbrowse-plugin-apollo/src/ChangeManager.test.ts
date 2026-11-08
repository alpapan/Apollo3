import type { Change } from '@apollo-annotation/common'
import {
  AddFeatureChange,
  Validation,
  ValidationResultSet,
  validationRegistry,
} from '@apollo-annotation/shared'
import { types } from '@jbrowse/mobx-state-tree'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

import { ChangeManager } from './ChangeManager'

const ASSEMBLY = 'assembly-1'

/** Fails post-validation of an AddFeatureChange only, so its inverse passes. */
class RejectAddsAfterApply extends Validation {
  name = 'RejectAddsAfterApply'
  rejecting = true
  frontendPostValidate(change: Change) {
    if (this.rejecting && change.typeName === 'AddFeatureChange') {
      return Promise.resolve({
        validationName: this.name,
        error: { message: 'post-apply check message' },
      })
    }
    return Promise.resolve({ validationName: this.name })
  }
}

interface Harness {
  manager: ChangeManager
  notifications: { message: string; level: string }[]
  submitted: string[]
  localFeatures: Set<string>
  setBackendResult(result: ValidationResultSet): void
}

/** Real MST tree for the session and data store, fake only the backend driver. */
function makeHarness(): Harness {
  const notifications: Harness['notifications'] = []
  const submitted: string[] = []
  const localFeatures = new Set<string>()
  let backendResult = new ValidationResultSet()
  const driver = {
    submitChange(change: Change) {
      submitted.push(change.typeName)
      return Promise.resolve(backendResult)
    },
  }
  const DataStore = types
    .model('DataStore', {})
    .volatile(() => ({
      collaborationServerDriver: driver,
      getBackendDriver: () => driver,
    }))
    .actions(() => ({
      addFeature(_assembly: string, feature: { _id: string }) {
        localFeatures.add(feature._id)
      },
      deleteFeature(id: string) {
        localFeatures.delete(id)
      },
      getFeature(id: string) {
        return localFeatures.has(id) ? { _id: id } : undefined
      },
    }))
  const Session = types
    .model('Session', {
      rpcManager: types.frozen(),
      configuration: types.frozen(),
      isLocked: false,
      changeInProgress: false,
      jobsManager: types.frozen(),
      apolloDataStore: DataStore,
    })
    .actions((self) => ({
      setChangeInProgress(value: boolean) {
        self.changeInProgress = value
      },
      notify(message: string, level = 'warning') {
        notifications.push({ message, level })
      },
    }))
  const session = Session.create({
    rpcManager: {},
    configuration: {},
    jobsManager: {},
    apolloDataStore: {},
  })
  return {
    manager: new ChangeManager(session.apolloDataStore as never),
    notifications,
    submitted,
    localFeatures,
    setBackendResult: (result) => {
      backendResult = result
    },
  }
}

function addFeature() {
  return new AddFeatureChange({
    typeName: 'AddFeatureChange',
    assembly: ASSEMBLY,
    changedIds: ['gene-1'],
    addedFeature: {
      _id: 'gene-1',
      refSeq: 'ctgA',
      min: 10,
      max: 20,
      type: 'gene',
    },
  })
}

describe('ChangeManager.submit', () => {
  const rejecter = new RejectAddsAfterApply()

  beforeEach(() => {
    rejecter.rejecting = true
    validationRegistry.registerValidation(rejecter)
  })
  afterEach(() => {
    validationRegistry.validations.delete(rejecter)
  })

  it('reverts a change that fails post-validation and does not send it to the server', async () => {
    const h = makeHarness()

    await h.manager.submit(addFeature())

    expect(h.submitted).toEqual([])
    expect([...h.localFeatures]).toEqual([])
    expect(h.notifications.map((n) => n.message)).toContainEqual(
      expect.stringContaining('post-apply check message'),
    )
  })

  it('reports the backend validation messages when the server rejects the change', async () => {
    const h = makeHarness()
    rejecter.rejecting = false
    const rejection = new ValidationResultSet()
    rejection.add({
      validationName: 'server',
      error: { message: 'server says no' },
    })
    h.setBackendResult(rejection)

    await h.manager.submit(addFeature())

    expect(h.notifications.map((n) => n.message)).toContainEqual(
      expect.stringContaining('server says no'),
    )
    expect([...h.localFeatures]).toEqual([])
  })
})
