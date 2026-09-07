import type { ZodType } from "zod";
import { HttpError } from "./fileUtils";

// The explicit `any, any` params decouple T from the schema's Def/Input type positions —
// without them, TS can infer T from ZodEffects/ZodDefault's Input type (which is `T | undefined`
// for a field with `.default()`) instead of its Output type, making parsed fields look optional.
export function parseBody<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => i.message).join("; ") || "Invalid request body");
  }
  return result.data;
}
