import type { Dictionary } from '@/i18n';

/** Keys of the `errors` section of the dictionary. */
export type GameErrorKey = keyof Dictionary['errors'];

/**
 * A refusal the user is allowed to see, carrying a dictionary key rather than a
 * message so it renders in the user's language.
 */
export class GameError extends Error {
  constructor(readonly key: GameErrorKey) {
    super(key);
    this.name = 'GameError';
  }
}

export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}
