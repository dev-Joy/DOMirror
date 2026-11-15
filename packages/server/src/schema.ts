import type { PostChangesRequest, StyleChange, StyleChangeInput } from '@domirror/shared';
import * as z from 'zod/v4';

const PositiveInt = z.number().int().positive();

export const StyleChangeInputSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    file: z.string().min(1),
    line: PositiveInt,
    column: PositiveInt,
    inherited: z.boolean(),
  }),
  selectorHint: z.string(),
  property: z.string().min(1),
  before: z.object({
    authored: z.string().nullable(),
    computed: z.string(),
  }),
  after: z.string(),
  pageUrl: z.string(),
  createdAt: z.string(),
}) satisfies z.ZodType<StyleChangeInput>;

export const StyleChangeSchema = StyleChangeInputSchema.extend({
  status: z.enum(['pending', 'applied']),
}) satisfies z.ZodType<StyleChange>;

export const PostChangesRequestSchema = z.object({
  changes: z.array(StyleChangeInputSchema),
}) satisfies z.ZodType<PostChangesRequest>;
