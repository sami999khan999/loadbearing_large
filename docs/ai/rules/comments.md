---
title: Comments
description: Line comments only, two lines maximum, and where the reasoning goes instead.
---

# Comments

- **Every comment is `//`. There is no second form.** No `/* */`, no JSDoc — not above a class, not
  as a separator, not for commented-out code. Enforced as a build failure, so no inline comment can
  silence it.
- **Two lines is the ceiling.** A comment's job is to stop the *next* reader misreading the line
  under it. The long-form argument goes in `packages/<name>/docs/reference/`, where it gets reviewed
  like prose. Say the constraint in the code; let the reference page carry the argument.
- **Commented-out code is not a comment.** Git remembers the deleted version; a reader cannot tell a
  deliberate placeholder from a 2am regression. Write the sentence instead.
- **This is not a rule against comments.** One saying why the obvious approach is wrong is worth more
  than the line it sits above.

---

**The argument.**
[`docs/opinions/comments.md`](../../opinions/comments.md) — line comments only, and where the reasoning goes instead.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**
