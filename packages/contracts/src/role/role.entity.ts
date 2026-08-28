import { RoleContract, type RoleDto } from "./role.contract.js";

// What a role knows about itself, with no I/O — the questions a component would
// otherwise answer inline, three times, slightly differently.
export class RoleEntity {
  private constructor(private readonly dto: RoleDto) {}

  public static from(dto: RoleDto): RoleEntity {
    return new RoleEntity(RoleContract.entity.parse(dto));
  }

  public get id(): RoleDto["id"] {
    return this.dto.id;
  }

  public get label(): string {
    return this.dto.name;
  }

  // Seeded roles are re-written by `SystemRoleSeed` on every deploy, so an edit to one
  // survives until the next one and then silently disappears. Whether a UI offers the
  // edit at all is this question, asked once.
  public get editable(): boolean {
    return !this.dto.isSystem;
  }

  // `owner` is the only wildcard role the seed creates. It is worth naming because the
  // answer to "why does this row show every permission" is otherwise a mystery.
  public get grantsEverything(): boolean {
    return this.dto.key === "owner";
  }

  public get permissions(): readonly string[] {
    return this.dto.permissions;
  }
}
