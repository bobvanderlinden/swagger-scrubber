import 'mocha'
import { expect } from 'chai'
import {
  validateDocument,
  validatePath,
  getPathParameters,
  stringifyJsonPath
} from '../src/validation'

const minimalDocument = {
  openapi: '3.0.0',
  info: {
    title: 'minimal',
    version: '1.0'
  },
  servers: [],
  paths: {},
  definitions: {}
}

function validationMessages(document) {
  return validateDocument(document).map(error => `${stringifyJsonPath(error.jsonPath)}: ${error.message}`)
}

describe('validateDocument', () => {
  it('should validate absent swagger version', () => {
    expect(validationMessages({})).to.include(
      ": No 'swagger' defined in document",
      ": No 'definitions' defined in document",
      ": No 'paths' defined in document"
    )
  })

  it('should validate reference to absent definition', () => {
    const errorMessages = validationMessages({
      ...minimalDocument,
      paths: {
        '/': {
          get: {
            responses: {
              200: {
                schema: {
                  $ref: '#/definitions/does_not_exist'
                }
              }
            }
          }
        }
      }
    })
    expect(errorMessages).to.include.members([
      `paths/"/"/get/responses/200/schema: Reference '#/definitions/does_not_exist' not found`
    ])
  })
  it('should validate path parameters', () => {
    const errorMessages = validationMessages({
      ...minimalDocument,
      paths: {
        '/path/with/{parameter}': {
          'get': {
            parameters: [],
            responses: {
              '200': {
                description: '',
                schema: { type: 'string' }
              }
            }
          }
        }
      }
    })
    expect(errorMessages).to.include.members([
      `paths/"/path/with/{parameter}"/get/parameters: Path references to parameter 'parameter', but it is not defined as a parameter in 'get' method.`
    ])
  })
})

describe('validatePath', () => {

})

describe('getPathParameters', () => {
  it('should retrieve parameters', () => {
    const result = getPathParameters('/one/{two}/three/{four}')
    expect(result).to.include.ordered.members([
      'two',
      'four'
    ])
  })
})