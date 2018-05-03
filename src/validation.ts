import {
  unique,
  filterNonNull,
  toObject,
  deleteJsonPath,
  lookupJsonPath,
  sort,
  equals
} from './utils'

function parseRef(ref, context: Context): JsonPath {
  const segments = ref.split('/')
  if (segments[0] !== '#') {
    throw new Error(`Invalid reference '${ref}'`)
  }
  segments.shift()
  return segments
}

interface SwaggerDocument {
  url: string,
  content: JSON
}
type Result<T> = {
  success: false,
  validationErrors: ValidationErrors
} | {
  success: true,
  result: T,
  validationErrors: ValidationErrors
}

type ValidationErrors = ValidationError[];
type JsonPath = string[];
export function stringifyJsonPath(path: JsonPath): string {
  return path.map(segment => {
    if (segment.indexOf('/') >= 0) {
      return `"${segment.replace('"', '\\"')}"`
    } else {
      return segment
    }
  }).join("/")
}

type SpecificValidationError
= { type: 'missing-swagger' }
| { type: 'missing-paths' }
| { type: 'path-parameter-not-defined' }
| { type: 'duplicate-path-parameter' }
| { type: 'missing-definitions' }
| { type: 'missing-path-description' }
| { type: 'reference-not-found' }
| { type: 'duplicate-body-parameter' }
| { type: 'paths-alphabetical' }
| { type: 'definitions-alphabetical' }

type ValidationError = {
  type: SpecificValidationError['type'],
  jsonPath: JsonPath,
  message: string,
}

type ValidationErrorType = ValidationError['type']

function validationError(type: ValidationErrorType, jsonPath: JsonPath, message: string): ValidationError {
  return {
    type,
    jsonPath,
    message
  }
}

interface Context {
  jsonPath: JsonPath,
  parentObjects: Array<any>,
  document: SwaggerDocument,
  handledObjects: Set<any>
}

function traverseContext(key: string, self: any, context: Context): Context {
  return {
    ...context,
    jsonPath: [...context.jsonPath, key],
    parentObjects: [...context.parentObjects, self]
  }
}

function traverse(obj: any, context: Context): boolean {
  if (context.handledObjects.has(obj)) {
    return true;
  } else {
    context.handledObjects.add(obj)
  }
}

export function getPathParameters(path: string): string[] {
  const variableRegex = /\{(\w+)\}/g;
  let match;
  const result = []
  while (match = variableRegex.exec(path)) {
    result.push(match[1])
  }
  return result
}

function ifThenElse<T>(condition: boolean, then: () => T, otherwise: () => T): T {
  if (condition) {
    return then()
  } else {
    return otherwise()
  }
}

function ifNotThenElse<T>(condition: boolean, then: () => T, otherwise: () => T): T {
  return ifThenElse(!condition, then, otherwise)
}

function ifNotThen(condition: boolean, then: () => ValidationErrors): ValidationErrors {
  return ifNotThenElse(condition, then, () => [])
}

function branch<T, TResult>(value: T | null | undefined, then: (value: T) => TResult, otherwise: () => TResult): TResult {
  if (value === null || value === undefined) {
    return otherwise()
  } else {
    return then(value)
  }
}

function branchNot<T, TResult>(value: T | null | undefined, otherwise: () => TResult, then: (value: T) => TResult): TResult {
  return branch(value, then, otherwise)
}

export function validateDocument(document: any, context: Context = {
  parentObjects: [],
  jsonPath: [],
  document: {
    url: '',
    content: document
  },
  handledObjects: new Set()
}): ValidationErrors {
  if (traverse(document, context)) { return [] }
  return [
    ...ifNotThenElse(document.swagger === '2.0',
      () => [validationError('missing-swagger', context.jsonPath, `No 'swagger' defined in document`)],
      () => []
    ),
    ...branchNot(document.definitions,
      () => [validationError('missing-definitions', context.jsonPath, `No 'definitions' defined in document`)],
      (definitions) => {
        const definitionNames = Object.entries(definitions).map(([key, value]) => key)
        return [
          ...ifNotThen(equals(definitionNames, sort(definitionNames)),
            () => [validationError('definitions-alphabetical', [...context.jsonPath, 'definitions'], 'Definitions are not alphabetical')]
          ),
          ...Object.entries(definitions)
            .flatMap(([key, value]) => validateJsonSchema(value, {
              ...context,
              jsonPath: [...context.jsonPath, 'definitions', key],
              parentObjects: [...context.parentObjects, document]
            }))
        ]
      }
    ),
    ...branchNot(document.paths,
      () => [validationError('missing-paths', context.jsonPath, `No 'paths' defined in document`)],
      (paths) => {
        const pathKeys = Object.keys(paths)
        return [
          ...ifNotThen(equals(pathKeys, sort(pathKeys)),
            () => [validationError('paths-alphabetical', [...context.jsonPath, 'paths'], 'Paths are not alphabetical')]
          ),
          ...Object.entries(paths)
            .flatMap(([key, value]) => validatePath(key, value, {
              ...context,
              jsonPath: [...context.jsonPath, 'paths', key],
              parentObjects: [...context.parentObjects, document]
            }))
          ]
        }
    )
  ]
}

export function validatePath(path: string, content: { [key: string]: any }, context: Context): ValidationErrors {
  if (traverse(content, context)) { return [] }
  const pathParameterReferences = getPathParameters(path)

  const pathParameterReferenceErrors = pathParameterReferences.flatMap(parameterInPath =>
    Object.entries(content)
      .filter(([methodName, method]) => (
        (method.parameters || [])
          .filter(parameter => parameter.in === 'path')
          .filter(parameter => parameter.name === parameterInPath)
          .length === 0
      ))
      .flatMap(([methodName, method]) => [
        validationError('path-parameter-not-defined', [...context.jsonPath, methodName, 'parameters'], `Path references to parameter '${parameterInPath}', but it is not defined as a parameter in '${methodName}' method.`)
      ])
    )


  return Object.entries(content)
    .flatMap(([key, value]) => {
      return [
        ...ifNotThenElse(unique(pathParameterReferences).length === pathParameterReferences.length,
          () => [validationError('duplicate-path-parameter', context.jsonPath, `Duplicate path parameters (${JSON.stringify(pathParameterReferences)})`)],
          () => []
        ),
        ...validateMethod(value, traverseContext(key, content, context)),
        ...pathParameterReferenceErrors
      ]
    })
}

function validateMethod(method, context: Context): ValidationErrors {
  if (traverse(method, context)) { return [] }
  const bodyParameters = (method.parameters || [])
    .filter(parameter => parameter.in === 'body')
  return [
    ...ifNotThen(bodyParameters.length < 2,
      () => [validationError('duplicate-body-parameter', [...context.jsonPath, 'parameters'], 'Duplicate body parameter in method')]
    ),
    ...Object.entries(method.responses)
      .flatMap(([key, value]) => validateResponse(value, {
        ...context,
        jsonPath: [...context.jsonPath, 'responses', key],
        parentObjects: [...context.parentObjects, method, method.responses]
      }))
  ]
}

function validateResponse(response, context: Context): ValidationErrors {
  if (traverse(response, context)) { return [] }

  return [
    ...branchNot(response.description,
      () => [validationError('missing-path-description', [...context.jsonPath, 'description'], `No 'description' field was defined for response`)],
      (_) => []
    ),
    ...branchNot(response.schema,
      () => [],
      (schema) => validateJsonSchema(response.schema, traverseContext('schema', response, context))
    )
  ]
}

function validateJsonSchema(value: any, context: Context): ValidationErrors {
  if (traverse(value, context)) { return [] }
  if (typeof value !== 'object') {
    return []
  }
  if (value instanceof Array) {
    return value.flatMap((item, index) => validateJsonSchema(item, {
      ...context,
      jsonPath: [...context.jsonPath, index.toString()]
    }))
  }
  if (context.parentObjects.indexOf(value) !== -1) {
    return []
  }
  const parentsAndMe = [...context.parentObjects, value]
  if (value.$ref) {
    const jsonPath = parseRef(value.$ref, context)
    const definition = lookupJsonPath(context.document.content, jsonPath)
    if (!definition) {
      return [validationError('reference-not-found', context.jsonPath, `Reference '${value.$ref}' not found`)]
    }
    
    return validateJsonSchema(definition, {
      ...context,
      jsonPath: jsonPath,
      parentObjects: parentsAndMe
    })
  }
  return Object.entries(value)
    .flatMap(([key, value]) => validateJsonSchema(value, {
      ...context,
      jsonPath: [...context.jsonPath, key],
      parentObjects: parentsAndMe
    }))
}
