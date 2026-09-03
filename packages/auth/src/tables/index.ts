import "dotenv/config";
import { AuthFactory } from "../auth.factory.js";
import { type CacheStore, Database, getSchema, type OrganizationId } from "../import.js";
import { AuthMailer } from "../mail/auth.mailer.js";
import { MembershipEnroller } from "../session/membership.enroller.js";
import { MembershipReader, type OrganizationSummary } from "../session/membership.reader.js";

// What Better Auth's own tables must look like, printed from the pinned runtime.
//
// This replaces the `better-auth generate` step the setup doc describes. The published
// `@better-auth/cli` trails the library by two minor versions, and a generator that does
// not know about the runtime's newer fields writes a schema that is wrong in exactly the
// way nothing catches until a query fails in production. `getSchema` is the same function
// the CLI calls, taken from the version actually installed.
//
// Run it after any Better Auth upgrade and diff the output against
// `packages/infrastructure/src/schema/auth.schema.ts`. Every field below needs a matching property
// **under Better Auth's own name** — the Drizzle adapter resolves a column by looking up
// `schema[model][field]`, so the property keys are load-bearing and the SQL column names
// are not.
//
// Nothing here connects: `new Pool()` is lazy, and no query is issued.

const url = process.env.DATABASE_URL ?? "postgres://unused:unused@localhost:5432/unused";

const unreachable = (): never => {
  throw new Error("auth.tables.ts inspects configuration only.");
};

const cache: CacheStore = {
  get: unreachable,
  set: unreachable,
  delete: unreachable,
  deletePrefix: unreachable,
};

class UnusedMembershipReader extends MembershipReader {
  // Not `async`: there is nothing to await, and `never` satisfies the port's return type.
  public override activeOrganizationFor(): Promise<OrganizationId | null> {
    return unreachable();
  }

  public override isMember(): Promise<boolean> {
    return unreachable();
  }

  public override organizationsFor(): Promise<readonly OrganizationSummary[]> {
    return unreachable();
  }
}

class UnusedMembershipEnroller extends MembershipEnroller {
  public override enrol(): Promise<OrganizationId | null> {
    return unreachable();
  }
}

class UnusedAuthMailer extends AuthMailer {
  public override sendVerification(): Promise<void> {
    return unreachable();
  }

  public override sendPasswordReset(): Promise<void> {
    return unreachable();
  }

  public override sendTwoFactorOtp(): Promise<void> {
    return unreachable();
  }

  public override sendEmailChangeConfirmation(): Promise<void> {
    return unreachable();
  }
}

// Through `AuthFactory`, never a second copy of the options: a restated `plugins` or
// `additionalFields` would describe an auth instance that does not exist.
const auth = AuthFactory.create(
  {
    secret: "inspect-only-inspect-only-inspect-only",
    baseUrl: "http://localhost:3000",
    trustedOrigins: [],
    sessionMaxAgeSeconds: 604_800,
    cookieCacheMaxAgeSeconds: 60,
    requireEmailVerification: true,
    appName: "Inspect",
    // The mode changes nothing about the schema — no enroller runs here — but the type
    // is closed, so stating it is how this script keeps compiling against the real config.
    enrolmentMode: "invite" as const,
    // Google deliberately absent: the provider adds no table, and supplying credentials
    // to a script anyone runs by hand is how a secret ends up in a shell history.
  },
  new Database({ url }),
  cache,
  new UnusedMembershipReader(),
  new UnusedMembershipEnroller(),
  new UnusedAuthMailer(),
);

for (const [model, table] of Object.entries(getSchema(auth.options))) {
  console.log(`\n${model}`);

  for (const [field, attribute] of Object.entries(table.fields)) {
    const flags = [
      attribute.required ? "required" : "nullable",
      ...(attribute.unique ? ["unique"] : []),
      ...(attribute.defaultValue !== undefined ? ["default"] : []),
      ...(attribute.references
        ? [`→ ${attribute.references.model}.${attribute.references.field}`]
        : []),
    ];
    console.log(`  ${field.padEnd(24)} ${String(attribute.type).padEnd(10)} ${flags.join(" ")}`);
  }
}
