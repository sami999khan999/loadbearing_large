import { z } from "../import.js";

// Branded, so `reactivateTask(goalId, taskId)` with the arguments swapped is a
// compile error rather than a query that returns nothing.
export class Identifiers {
  private constructor() {}

  public static readonly userId = z.uuid().brand<"UserId">();
  public static readonly roleId = z.uuid().brand<"RoleId">();
  public static readonly goalId = z.uuid().brand<"GoalId">();
  public static readonly taskId = z.uuid().brand<"TaskId">();
  public static readonly apiKeyId = z.uuid().brand<"ApiKeyId">();
}

export type UserId = z.infer<typeof Identifiers.userId>;
export type RoleId = z.infer<typeof Identifiers.roleId>;
export type GoalId = z.infer<typeof Identifiers.goalId>;
export type TaskId = z.infer<typeof Identifiers.taskId>;
export type ApiKeyId = z.infer<typeof Identifiers.apiKeyId>;
