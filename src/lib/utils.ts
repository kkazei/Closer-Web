/**
 * Shared utility functions for Closer.
 */

/**
 * Concatenate class names, filtering out falsy values.
 * Lightweight alternative to `clsx` / `cn` for simple cases.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
