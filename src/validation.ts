import {
  unique,
  filterNonNull,
  toObject,
  deleteJsonPath,
  lookupJsonPath
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

function validateIf<T>(
  value: T | null | undefined | boolean,
  onAbsent: () => ValidationErrors,
  onSuccess: (value: T) => ValidationErrors = (_) => []
): ValidationErrors {
  if (value === null || value === undefined || value === false) {
    return onAbsent()
  } else if (value === true) {
    return []
  } else {
    return onSuccess(value)
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

function validate(condition, validationErrorFactory: () => ValidationError): ValidationErrors {
  if (condition) {
    return []
  } else {
    return [validationErrorFactory()]
  }
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
    ...validateIf(document.swagger === '2.0',
      () => [validationError('missing-swagger', context.jsonPath, `No 'swagger' defined in document`)]
    ),
    ...validateIf(document.definitions,
      () => [validationError('missing-definitions', context.jsonPath, `No 'definitions' defined in document`)],
      (definitions) => Object.entries(definitions)
        .flatMap(([key, value]) => validateJsonSchema(value, {
          ...context,
          jsonPath: [...context.jsonPath, 'definitions', key],
          parentObjects: [...context.parentObjects, document]
        }))
    ),
    ...validateIf(document.paths,
      () => [validationError('missing-paths', context.jsonPath, `No 'paths' defined in document`)],
      (paths) => Object.entries(paths)
        .flatMap(([key, value]) => validatePath(key, value, {
          ...context,
          jsonPath: [...context.jsonPath, 'paths', key],
          parentObjects: [...context.parentObjects, document]
        }))
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
        ...validateIf(unique(pathParameterReferences).length === pathParameterReferences.length,
          () => [validationError('duplicate-path-parameter', context.jsonPath, `Duplicate path parameters (${JSON.stringify(pathParameterReferences)})`)]
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
    ...validate(bodyParameters.length < 2,
      () => validationError('duplicate-body-parameter', [...context.jsonPath, 'parameters'], 'Duplicate body parameter in method')
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
    ...validateIf(response.description,
      () => [validationError('missing-path-description', [...context.jsonPath, 'description'], `No 'description' field was defined for response`)],
      (_) => []
    ),
    ...validateIf(response.schema,
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
