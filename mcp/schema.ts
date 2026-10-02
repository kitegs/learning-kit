import * as z from 'zod/v4'

// 桥接与主进程使用同一份校验，但主进程仍重新验证，不能信任调用方。
export const noteSchema = z.strictObject({
  requestKey: z.string().regex(/^[A-Za-z0-9._:@-]{1,128}$/),
  title: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(30000).refine(value => !!value.trim(), '正文不能为空')
})
export const knowledgeSchema = z.strictObject({
  requestKey: z.string().regex(/^[A-Za-z0-9._:@-]{1,128}$/),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(10000)
})
export const operationSchema = z.strictObject({ operationId: z.string().uuid() })
export const emptySchema = z.strictObject({})
