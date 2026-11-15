import { z } from 'zod';

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const MODEL_ALIASES = ['opus', 'sonnet', 'haiku'] as const;
const PINNED_MODEL_PATTERN = /^claude-[a-z0-9][a-z0-9.-]*$/;
const MAX_PINNED_MODEL_LENGTH = 64;
const STEP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const effortSchema = z.enum(EFFORT_LEVELS);

const modelLiteral = z.union([
  z.enum(MODEL_ALIASES),
  z.string().max(MAX_PINNED_MODEL_LENGTH).regex(PINNED_MODEL_PATTERN),
]);

const fromStep = z.strictObject({
  from: z.string().regex(STEP_ID_PATTERN).describe('Id of an ancestor step'),
});

const stepChoice = (literal: z.ZodType<string>) => z.union([literal, z.literal('auto'), fromStep]);

export const stepModelSchema = stepChoice(modelLiteral);
export const stepEffortSchema = stepChoice(effortSchema);
