import {
  validateDocument
} from './validation'
import {
  scrub
} from './scrub'

const swagger = require(process.argv[2])
const validationErrors = validateDocument(swagger)
const scrubbedSwagger = scrub(swagger)
for (let validationError of validationErrors) {
  console.log(validationError.message)
}
require('fs').writeFileSync('swagger.scrubbed.json', JSON.stringify(scrubbedSwagger, null, '  '))