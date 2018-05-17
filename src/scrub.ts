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

export async function scrub(source: any, validationErrors) {
  const paths = validationErrors
    .filter(error => error.path[0] === 'paths' && error.path.length >= 2)
    .map(error => error.path.slice(0, 3))
  const definitions = validationErrors
    .filter(error => error.path[0] === 'definitions' && error.path.length >= 2)
    .map(error => error.path.slice(0, 2))

  const scrubbed = unique(
      paths.concat(definitions)
        .map(path => JSON.stringify(path))
    )
    .map(path => JSON.parse(path))
    .reduce((json, path) => deleteJsonPath(json, path), source)
  
  return {
    ...scrubbed,
    paths: removeEmptyObjects(
      mapObject(scrubbed.paths, entries => entries.map(([key, value]) => [key, removeEmptyObjects(value)]))
    ),
    definitions: removeEmptyObjects(scrubbed.definitions)
  }
}

export async function validateAndScrub(source, options) {
  const converted = await Converter.convert({
    from: options.from,
    to: 'swagger_2',
    source
  })
  const result = await converted.validate()
  const validationErrors = result.errors || []
  const spec = JSON.parse(converted.stringify())
  const scrubbedSpec = await scrub(spec, validationErrors)
  return {
    spec: scrubbedSpec,
    validationErrors: validationErrors
  }
}

export async function validateAndScrubExhaustive(spec, options) {
  const validationErrors = []
  let iteration = 0
  do {
    const result = await validateAndScrub(spec, options)
    options = { ...options, from: 'swagger_2' }
    if (result.validationErrors.length === 0) {
      break
    }
    validationErrors.push(...result.validationErrors.map(error => ({ ...error, iteration })))
    spec = result.spec
    iteration++
  } while (true);

  return {
    spec,
    validationErrors
  }
}
