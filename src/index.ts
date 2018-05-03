// import {
//   validateDocument
// } from './validation'
// import {
//   scrub
// } from './scrub'

// const swagger = require(process.argv[2])
// const validationErrors = validateDocument(swagger)
// const scrubbedSwagger = scrub(swagger)
// for (let validationError of validationErrors) {
//   console.log(validationError.message)
// }
// require('fs').writeFileSync('swagger.scrubbed.json', JSON.stringify(scrubbedSwagger, null, '  '))

import {
  deleteJsonPath,
  unique,
  toObject,
  equals
} from './utils'
import * as Converter from 'api-spec-converter'

function isEmptyObject(obj) {
  return obj.constructor === Object && Object.keys(obj).length === 0
}

function mapObject(obj, fn) {
  return toObject(fn(Object.entries(obj)))
}

function removeEmptyObjects(obj) {
  return mapObject(obj, entries => entries.filter(([key, value]) => !isEmptyObject(value)))
}

const totalErrors = []

async function scrub(source) {
  const converted = await Converter.convert({
    from: 'swagger_2',
    to: 'swagger_2',
    source
  })
  const result = await converted.validate()
  const json = JSON.parse(converted.stringify())

  const errors = result.errors
    .filter(error => error.code !== 'DUPLICATE_OPERATIONID')

  totalErrors.push(...errors)

  const paths = errors
    .filter(error => error.path[0] === 'paths' && error.path.length >= 2)
    .map(error => error.path.slice(0, 3))
  const definitions = errors
    .filter(error => error.path[0] === 'definitions' && error.path.length >= 2)
    .map(error => error.path.slice(0, 2))

  const scrubbed = unique(
      paths.concat(definitions)
        .map(path => JSON.stringify(path))
    )
    .map(path => JSON.parse(path))
    .reduce((state, path) => deleteJsonPath(state, path), json)
  
  const scrubbed2 = {
    ...scrubbed,
    paths: removeEmptyObjects(
      mapObject(scrubbed.paths, entries => entries.map(([key, value]) => [key, removeEmptyObjects(value)]))
    ),
    definitions: removeEmptyObjects(scrubbed.definitions)
  }

  return scrubbed2
}

async function keepScrubbing(source) {
  while (true) {
    const target = await scrub(source)
    if (equals(source, target)) {
      return target
    } else {
      source = target
    }
  }
}

keepScrubbing('api-development.ons.io.swagger.json').then(result => {
  process.stdout.write(JSON.stringify(result, null, '  '))
  process.stderr.write(JSON.stringify(totalErrors, null, '  '))
})