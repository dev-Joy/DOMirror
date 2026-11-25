import type {
  ComponentRuntimeInfo,
  InstanceCount,
  PostChangesRequest,
  PostCommentsRequest,
  ScreenComment,
  ScreenCommentInput,
  StyleChange,
  StyleChangeInput,
} from '@domirror/shared';
import { BRIDGE_OWNER_MAX } from '@domirror/shared';
import * as z from 'zod/v4';

const PositiveInt = z.number().int().positive();
/** 코멘트의 자유 서술 보조 문자열(`selectorHint`·`pageUrl`) 상한. */
const TEXT_MAX = 2048;

/** 같은 컴포넌트 화면 렌더 수(INT-012 FR-8). capped=true면 방문 상한 도달(`N+`). */
const InstanceCountSchema = z.object({
  count: PositiveInt,
  capped: z.boolean(),
}) satisfies z.ZodType<InstanceCount>;

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
  instanceCount: InstanceCountSchema.optional(),
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

/** 런타임 위치의 정확도(INT-011 FR-5). 라인을 신뢰할 수 없으면 `line-unverified`다. */
const RuntimeSourceRefSchema = z.object({
  file: z.string().min(1).max(TEXT_MAX),
  line: PositiveInt.optional(),
  column: PositiveInt.optional(),
  precision: z.enum(['exact', 'line-unverified']),
});

/** React DevTools hook·fiber에서 얻은 컴포넌트 정보(선택 필드, INT-011 FR-9). */
export const ComponentRuntimeInfoSchema = z.object({
  name: z.string().min(1).max(TEXT_MAX),
  definition: RuntimeSourceRefSchema.optional(),
  callSite: RuntimeSourceRefSchema.optional(),
  owners: z.array(z.string().max(TEXT_MAX)).max(BRIDGE_OWNER_MAX).optional(),
  via: z.enum(['plugin', 'devtools', 'fiber']),
}) satisfies z.ZodType<ComponentRuntimeInfo>;

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
  // 런타임(DevTools·fiber)에서 얻은 컴포넌트 정보. 없으면 생략되는 선택 필드다(INT-011 FR-9·NFR-2).
  component: ComponentRuntimeInfoSchema.optional(),
}) satisfies z.ZodType<ScreenCommentInput>;

export const ScreenCommentSchema = ScreenCommentInputSchema.extend({
  status: z.enum(['open', 'resolved']),
}) satisfies z.ZodType<ScreenComment>;

export const PostCommentsRequestSchema = z.object({
  comments: z.array(ScreenCommentInputSchema),
}) satisfies z.ZodType<PostCommentsRequest>;
