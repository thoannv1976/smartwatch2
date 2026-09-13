/**
 * Test stub for the `server-only` package.
 *
 * In a Next.js build, importing `server-only` makes the bundler fail if a
 * module is pulled into a client bundle. Under Vitest there is no bundler, and
 * the real package throws on import, so tests resolve it to this empty module.
 */
export {};
