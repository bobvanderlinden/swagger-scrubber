import 'mocha'
import { expect } from 'chai'
import {
  validateDocument,
  validatePath,
  getPathParameters,
  stringifyJsonPath
} from '../src/validation'

const minimalDocument = {
  swagger: '2.0',
  info: {
    title: 'minimal',
    version: '1.0'
  },
  servers: [],
  paths: {},
  definitions: {}
}

function validationMessages(document) {
  return validateDocument(document)
}

describe('validateDocument', () => {
  it('should validate absent swagger version', () => {
    expect(validationMessages({
      ...minimalDocument,
      swagger: undefined
    })).to.deep.include.members([{
      type:'missing-swagger',
      jsonPath: [],
      message: "No 'swagger' defined in document"
    }])
  })

  it('should validate absent paths', () => {
    expect(validationMessages({
      ...minimalDocument,
      paths: undefined
    })).to.deep.include.members([{
      type:'missing-paths',
      jsonPath: [],
      message: "No 'paths' defined in document"
    }])
  })

  it('should validate absent paths', () => {
    expect(validationMessages({
      ...minimalDocument,
      definitions: undefined
    })).to.deep.include.members([{
      type:'missing-definitions',
      jsonPath: [],
      message: "No 'definitions' defined in document"
    }])
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
    expect(errorMessages).to.deep.include.members([{
      type: 'missing-path-description',
      message: "No 'description' field was defined for response",
      jsonPath: ['paths', '/', 'get', 'responses', '200', 'description']
    }, {
      type: 'reference-not-found',
      message: "Reference '#/definitions/does_not_exist' not found",
      jsonPath: ['paths','/','get','responses','200','schema']
    }])
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
    expect(errorMessages).to.deep.include.members([{
      jsonPath: ['paths','/path/with/{parameter}','get','parameters'],
      message: "Path references to parameter 'parameter', but it is not defined as a parameter in 'get' method.",
      type: 'path-parameter-not-defined'
    }])
  })
  it('should not return error for duplicate-body-parameter when a single body parameter is defined', () => {
    const errorMessages = validationMessages({
      ...minimalDocument,
      paths: {
        '/path': {
          'post': {
            parameters: [{
              in: 'body',
              schema: { type: 'string' }
            }],
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
    expect(errorMessages).to.deep.equal([])
  })
  it('should return error for duplicate-body-parameter', () => {
    const errorMessages = validationMessages({
      ...minimalDocument,
      paths: {
        '/path': {
          'post': {
            parameters: [{
              in: 'body',
              schema: { type: 'string' }
            }, {
              in: 'body',
              schema: { type: 'string' }
            }],
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
    expect(errorMessages).to.deep.include.members([{
      jsonPath: ['paths','/path','post','parameters'],
      message: 'Duplicate body parameter in method',
      type: 'duplicate-body-parameter'
    }])
  })
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