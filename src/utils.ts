export function filterNonNull<T>(list: (T | null | undefined)[]): T[] {
  return list.filter(item => item !== null && item !== undefined)
}
export function flatten<T>(list: T[][]): T[] {
  return list.flatMap(item => item)
}
Array.prototype.flatMap = function(lambda) { 
  return Array.prototype.concat.apply([], this.map(lambda)); 
};

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

export function lookupJsonPath(obj: any, path: string[]): any {
  return path.reduce((definition, name) => definition && definition[name], obj)
}