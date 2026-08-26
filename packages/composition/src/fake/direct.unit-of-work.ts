import { UnitOfWork } from "../import.js";

// Runs the work, opens nothing, rolls back nothing. A fake that could roll back would
// be testing the fake — atomicity is asserted against Postgres, in `db`'s integration
// tier, which is the whole reason that tier exists.
export class DirectUnitOfWork extends UnitOfWork {
  private calls = 0;

  public override run<T>(work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    return work();
  }

  // Enough to assert "this use-case wrapped its writes", which is the part a unit
  // test can honestly check.
  public runCount(): number {
    return this.calls;
  }
}
