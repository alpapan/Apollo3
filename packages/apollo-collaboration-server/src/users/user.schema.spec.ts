import { UserSchema } from '@apollo-annotation/schemas'

describe('User schema — Curatorium id1 tracking fields', () => {
  it('declares lastId1Kid as an optional String path', () => {
    const path = UserSchema.path('lastId1Kid')
    expect(path).toBeDefined()
    expect(path.instance).toBe('String')
    expect(path.isRequired).toBeFalsy()
  })

  it('declares lastId1BootId as an optional String path', () => {
    const path = UserSchema.path('lastId1BootId')
    expect(path).toBeDefined()
    expect(path.instance).toBe('String')
    expect(path.isRequired).toBeFalsy()
  })
})
