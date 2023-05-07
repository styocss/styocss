export type Arrayable<T> = T | T[]

export type PartialByKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
