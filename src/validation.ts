import {
  unique,
  filterNonNull,
  flatten,
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

type Sjaak = {
  type: 'koek'
} | {
  type: 'ei'
}

type SjaakType = Sjaak['type']

type ValidationErrors = ValidationError[];
type JsonPath = string[];
function stringifyJsonPath(path: JsonPath): string {
  return path.map(segment => {
    if (segment.indexOf('/') >= 0) {
      return `"${segment.replace('"', '\\"')}"`
    } else {
      return segment
    }
  }).join("/")
}
class ValidationError extends Error {
  path: JsonPath
  constructor(path: JsonPath, message: string) {
    super(`${stringifyJsonPath(path)}: ${message}`);
    this.path = path
  }
}
class ReferenceNotFoundError extends ValidationError {
  reference: string;
  constructor(path: JsonPath, reference: string) {
    super(path, `Reference '${reference}' not found`)
    this.reference = reference
  }
}
class InvalidReferenceError extends ValidationError {
  reference: string;
  constructor(path: JsonPath, reference: string) {
    super(path, `Invalid format for reference '${reference}'`)
    this.reference = reference
  }
}

interface Context {
  path: JsonPath,
  parentObjects: Array<any>,
  document: SwaggerDocument,
  handledObjects: Set<any>
}

function traverseContext(key: string, self: any, context: Context): Context {
  return {
    ...context,
    path: [...context.path, key],
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

export function validateDocument(document: any, context: Context = {
  parentObjects: [],
  path: [],
  document: {
    url: '',
    content: document
  },
  handledObjects: new Set()
}): ValidationErrors {
  if (traverse(document, context)) { return [] }
  return [
    ...validateIf(document.swagger === '2.0',
      () => [new ValidationError(context.path, `No 'swagger' defined in document`)]
    ),
    ...validateIf(document.definitions,
      () => [new ValidationError(context.path, `No 'definitions' defined in document`)],
      (definitions) => Object.entries(definitions)
        .flatMap(([key, value]) => validateJsonSchema(value, {
          ...context,
          path: [...context.path, 'definitions', key],
          parentObjects: [...context.parentObjects, document]
        }))
    ),
    ...validateIf(document.paths,
      () => [new ValidationError(context.path, `No 'paths' defined in document`)],
      (paths) => Object.entries(paths)
        .flatMap(([key, value]) => validatePath(key, value, {
          ...context,
          path: [...context.path, 'paths', key],
          parentObjects: [...context.parentObjects, document]
        }))
    )
  ]
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

export function validatePath(path: string, content: any, context: Context): ValidationErrors {
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
        new ValidationError([...context.path, methodName, 'parameters'], `Path references to parameter '${parameterInPath}', but it is not defined as a parameter in '${methodName}' method.`)
      ])
    )


  return Object.entries(content)
    .flatMap(([key, value]) => {
      return [
        ...validateIf(unique(pathParameterReferences).length === pathParameterReferences.length,
          () => [new ValidationError(context.path, `Duplicate path parameters (${JSON.stringify(pathParameterReferences)})`)]
        ),
        ...validateMethod(value, traverseContext(key, content, context)),
        ...pathParameterReferenceErrors
      ]
    })
}

function validateMethod(method, context: Context): ValidationErrors {
  if (traverse(method, context)) { return [] }
  return flatten([
    Object.entries(method.responses)
      .flatMap(([key, value]) => validateResponse(value, {
        ...context,
        path: [...context.path, 'responses', key],
        parentObjects: [...context.parentObjects, method, method.responses]
      })),
    
  ])
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

function validateResponse(response, context: Context): ValidationErrors {
  if (traverse(response, context)) { return [] }

  return flatten(filterNonNull([
    validateIf(response.description,
      () => [new ValidationError([...context.path, 'description'], `No 'description' field was defined for response`)],
      (_) => []
    ),
    validateIf(response.schema,
      () => [],
      (schema) => validateJsonSchema(response.schema, traverseContext('schema', response, context))
    )
  ]))
}

function validateJsonSchema(value: any, context: Context): ValidationErrors {
  if (traverse(value, context)) { return [] }
  if (typeof value !== 'object') {
    return []
  }
  if (value instanceof Array) {
    return value.flatMap((item, index) => validateJsonSchema(item, {
      ...context,
      path: [...context.path, index.toString()]
    }))
  }
  if (context.parentObjects.indexOf(value) !== -1) {
    return []
  }
  const parentsAndMe = [...context.parentObjects, value]
  if (value.$ref) {
    const path = parseRef(value.$ref, context)
    const definition = lookupJsonPath(context.document.content, path)
    if (!definition) {
      return [new ReferenceNotFoundError(context.path, value.$ref)]
    }
    
    return validateJsonSchema(definition, {
      ...context,
      path: path,
      parentObjects: parentsAndMe
    })
  }
  return Object.entries(value)
    .flatMap(([key, value]) => validateJsonSchema(value, {
      ...context,
      path: [...context.path, key],
      parentObjects: parentsAndMe
    }))
}
