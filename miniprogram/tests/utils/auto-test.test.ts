import { describe, it, expect } from 'vitest'
import { hello } from '../../src/utils/auto-test'

describe('auto-test', () => {
  it('should return hello message', () => {
    expect(hello()).toBe('Hello Auto Dev')
  })
})
