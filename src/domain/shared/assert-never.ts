/** Exhaustiveness check for discriminated unions. Reaching it means types and implementation disagree (an invariant violation), so it throws. */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
};
