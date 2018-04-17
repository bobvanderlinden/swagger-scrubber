import 'mocha'
import { expect } from 'chai'
import {
  deleteJsonPath
} from '../src/utils'

describe('deleteJsonPath', () => {
  it('should remove single attribute', () => {
    const result = deleteJsonPath({
      first: 3
    }, ['first'])
    expect(result).to.deep.equal({})
  })

  it('should keep unrelated attributes intact', () => {
    const result = deleteJsonPath({
      first: 3,
      second: 4
    }, ['first'])
    expect(result).to.deep.equal({
      second: 4
    })
  })

  it('should remove nested attribute', () => {
    const result = deleteJsonPath({
      first: {
        second: 3
      }
    }, ['first', 'second'])
    expect(result).to.deep.equal({
      first: {}
    })
  })
})