import {
  deleteJsonPath
} from './utils'
import {
  validateDocument
} from './validation'

export function scrub(swagger) {
  let result = swagger
  do {
    swagger = result
    const errors = validateDocument(result)
    result = scrubErrors(result, errors)
  } while (JSON.stringify(swagger) !== JSON.stringify(result));
  return result
}

export function scrubErrors(swagger, validationErrors) {
  return validationErrors.reduce((swagger, validationError) => {
    switch (validationError.jsonPath[0]) {
      case 'paths':
        return deleteJsonPath(swagger, validationError.jsonPath.slice(0, 3))
      case 'definitions':
        return deleteJsonPath(swagger, validationError.jsonPath.slice(0, 2))
      default:
        return swagger
    }
  }, swagger)
}