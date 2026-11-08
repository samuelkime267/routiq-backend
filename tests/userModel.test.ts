import { describe, expect, it } from "vitest";
import User from "@/models/user.model";

/**
 * Guards the fix for E11000 on `{ username: null }`.
 *
 * Accounts without a username (invited administrators, Google sign-ups) must
 * be allowed to coexist, while real usernames stay unique.
 */
describe("User username index", () => {
  it("only enforces uniqueness for stored usernames", () => {
    const usernameIndexes = User.schema
      .indexes()
      .filter(([fields]) => fields.username === 1);

    expect(usernameIndexes).toHaveLength(1);

    const [, options] = usernameIndexes[0];
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({
      username: { $type: "string" },
    });
    expect(User.schema.path("username")?.options.unique).not.toBe(true);
  });
});
