import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * project_images.product_tags 등 배열 태그 필드에 넣을 값 정규화.
 * 반드시 string[] 또는 null만 반환 (빈 배열은 null).
 */
export function toProductTagsArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const arr = value
    .filter((x): x is string => typeof x === 'string')
    .map((s) => String(s).trim())
    .filter(Boolean)
  return arr.length > 0 ? arr : null
}
