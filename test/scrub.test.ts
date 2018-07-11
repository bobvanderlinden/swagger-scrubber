import 'mocha'
import { expect } from 'chai'
import {
  scrub, validateAndScrub
} from '../src/scrub'

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
  it('should remove invalid paths', () => {
    const validPath = pathWithSchema('/valid', {
      type: 'string'
    })
    const invalidPath = pathWithSchema('/invalid', {
      $ref: '#/definitions/does_not_exist'
    })
    const document = {
      swagger: '2.0',
      paths: {
        ...invalidPath,
        ...validPath
      }
    }
    const scrubbedDocument = validateAndScrub(document, { from: 'swagger_2' })
    expect(scrubbedDocument).to.deep.equal({
      swagger: '2.0',
      paths: {
        ...validPath,
        '/invalid': {}
      }
    })
  })
  it('should remove invalid definitions', () => {
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
      swagger: '2.0',
      paths: {},
      definitions: {
        ...invalidDefinition,
        ...validDefinition
      }
    }
    const scrubbedDocument = scrub(document, { from: 'swagger_2' })
    expect(scrubbedDocument).to.deep.equal({
      swagger: '2.0',
      paths: {},
      definitions: {
        ...validDefinition,
      }
    })
  })
  it('should remove paths that refer to invalid definitions', () => {
    const invalidDefinition = {
      'invalid': {
        $ref: '#/definition/does_not_exist'
      }
    }
    const document = {
      swagger: '2.0',
      paths: {
        ...pathWithSchema('/toberemoved', {
          $ref: '#/definitions/invalid'
        })
      },
      definitions: {
        ...invalidDefinition
      }
    }
    const scrubbedDocument = validateAndScrub(document, { from: 'swagger_2' })
    expect(scrubbedDocument).to.deep.equal({
      swagger: '2.0',
      paths: {
        '/toberemoved': {}
      },
      definitions: {}
    })
  })
})