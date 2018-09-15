export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function toObject<T>(arr: [string, T][]): { [key: string]: T} {
  const result = {}
  for (let [key, value] of arr) {
    result[key] = value
  }
  return result
}

export function deleteJsonPath(obj, attributes: string[]): any {
  if (attributes.length === 0) {
    throw new Error(`Invalid argument for jsonPath: it is empty`)
  }
  const nextAttribute = attributes[0]
  if (attributes.length === 1) {
    return toObject(Object.entries(obj)
      .filter(([key, value]) => key !== nextAttribute)
    )
  }
  if (!(nextAttribute in obj)) {
    return obj
  }
  const tail = attributes.slice(1)
  return {
    ...obj,
    [nextAttribute]: deleteJsonPath(obj[nextAttribute], tail)
  }
}

export function equals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
