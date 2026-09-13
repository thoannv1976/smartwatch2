/**
 * Public surface of the pure simulation domain.
 *
 * Nothing in this folder may import from `@/server`, `@/db`, `@/app` or React.
 * That constraint is what makes official results reproducible and testable
 * without a database (spec 11.4).
 */
export * from './types';
export * from './config';
export * from './random';
export * from './formulas';
export * from './events';
export * from './competitors';
export * from './engine';
export * from './scoring';
export * from './analysis';
export * from './game';
