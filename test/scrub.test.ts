import 'mocha'
import { expect } from 'chai'
import {
  scrub, validateAndScrub, validateAndScrubExhaustive
} from '../src/scrub'

const validMinimalSpec = {
  swagger: '2.0',
  info: {
    title: 'dummy',
    version: '1.0'
  },
  paths: {}
}

function pathWithSchema(path, schema) {
  return {
    [path]: {
      'get': {
        responses: {
          '200': {
            description: 'example',
            schema: schema
          }
        }
      }
    }
  }
}

describe('scrub', () => {
  it('should remove invalid paths', async () => {
    const validPath = pathWithSchema('/valid', {
      type: 'string'
    })
    const invalidPath = pathWithSchema('/invalid', {
      $ref: '#/definitions/does_not_exist'
    })
    const document = {
      ...validMinimalSpec,
      paths: {
        ...invalidPath,
        ...validPath
      }
    }
    const scrubbedDocument = await validateAndScrub(document, { from: 'swagger_2' })
    expect(scrubbedDocument.spec).to.deep.equal({
      ...validMinimalSpec,
      paths: {
        ...validPath
      }
    })
  })
  it('should remove invalid definitions', async () => {
    const validDefinition = {
      'valid': {
        type: 'string'
      }
    }
    const invalidDefinition = {
      'invalid': {
        $ref: '#/definition/does_not_exist'
      }
    }
    const document = {
      ...validMinimalSpec,
      definitions: {
        ...invalidDefinition,
        ...validDefinition
      }
    }
    const result = await validateAndScrub(document, { from: 'swagger_2' })
    expect(result.spec).to.deep.equal({
      ...validMinimalSpec,
      definitions: {
        ...validDefinition,
      }
    })
  })
  it('should remove paths that refer to invalid definitions', async () => {
    const invalidDefinition = {
      'invalid': {
        $ref: '#/definition/does_not_exist'
      }
    }
    const document = {
      ...validMinimalSpec,
      paths: {
        ...pathWithSchema('/toberemoved', {
          $ref: '#/definitions/invalid'
        })
      },
      definitions: {
        ...invalidDefinition
      }
    }
    const result = await validateAndScrubExhaustive(document, { from: 'swagger_2' })
    expect(result.spec).to.deep.equal({
      ...validMinimalSpec,
      paths: {}
    })
  })
})
