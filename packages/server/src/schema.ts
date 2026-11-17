import type {
  PostChangesRequest,
  PostCommentsRequest,
  ScreenComment,
  ScreenCommentInput,
  StyleChange,
  StyleChangeInput,
} from '@domirror/shared';
import * as z from 'zod/v4';

const PositiveInt = z.number().int().positive();
/** 코멘트의 자유 서술 보조 문자열(`selectorHint`·`pageUrl`) 상한. */
const TEXT_MAX = 2048;

export const StyleChangeInputSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    file: z.string().min(1),
    line: PositiveInt,
    column: PositiveInt,
    inherited: z.boolean(),
    protected: z.boolean().optional(),
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

export const ProtectedAreaWarningSchema = z.object({
  code: z.literal('protected-area'),
  reason: z.enum(['pattern', 'node_modules']),
  message: z.string(),
});

export const PendingChangeSchema = StyleChangeSchema.extend({
  warning: ProtectedAreaWarningSchema.optional(),
});

export const PostChangesRequestSchema = z.object({
  changes: z.array(StyleChangeInputSchema),
}) satisfies z.ZodType<PostChangesRequest>;

export const ScreenCommentInputSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    file: z.string().min(1),
    line: PositiveInt,
    column: PositiveInt,
    inherited: z.boolean(),
  }),
  selectorHint: z.string().max(TEXT_MAX),
  pageUrl: z.string().max(TEXT_MAX),
  body: z.string().min(1).max(2000),
  createdAt: z.iso.datetime(),
}) satisfies z.ZodType<ScreenCommentInput>;

export const ScreenCommentSchema = ScreenCommentInputSchema.extend({
  status: z.enum(['open', 'resolved']),
}) satisfies z.ZodType<ScreenComment>;

export const PostCommentsRequestSchema = z.object({
  comments: z.array(ScreenCommentInputSchema),
}) satisfies z.ZodType<PostCommentsRequest>;
