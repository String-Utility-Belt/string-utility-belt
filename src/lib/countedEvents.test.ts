import { describe, expect, it } from 'vitest'
import { STEP_BUCKETS, stepBucket } from './countedEvents'

describe('stepBucket', () => {
  it('puts a pipeline size in one of the buckets the Worker accepts', () => {
    expect([1, 2, 3, 4, 7, 8, 40].map(stepBucket)).toEqual(['1', '2-3', '2-3', '4-7', '4-7', '8+', '8+'])
    for (let n = 1; n < 20; n++) expect(STEP_BUCKETS).toContain(stepBucket(n))
  })
})
