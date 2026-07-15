import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/** Validates req.body against a Zod schema, replacing it with the parsed
 * (and type-coerced) value, or responds 400 with the flattened error. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "invalid_request", details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}
