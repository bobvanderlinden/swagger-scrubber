interface Array<T> {
  flatMap<TResult>(fn: (item: T, index?: number) => Array<TResult>): Array<TResult>
  unique(): Array<T>
}
