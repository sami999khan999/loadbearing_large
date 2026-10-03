## What it is

Each box on the dashboard is a **card**. Some cards can be hidden: by one person for themselves, or
by an admin for everyone in the organization.

## Why it exists

A dashboard fills up. Letting people put away the cards they do not use keeps it calm, without
taking anything away from them.

## How it works

Four things decide whether a card shows, checked in this order. The first one that says "no"
wins.

| Order | Check | What the person is told |
|---|---|---|
| 1 | **Feature flag**: is hiding switched on for this organization? | "Not switched on for this organization yet." |
| 2 | **Permission**: may they see the card's data? | "Needs the permission …" |
| 3 | **The organization's choice**: did an admin hide it for everyone? | "Hidden for everyone by an administrator." |
| 4 | **Their own choice**: did they hide it? | "Hidden by choice. It can be shown again from the hidden cards." |

Some cards are **required** and can never be hidden: **Go to**, **Hidden cards** and the bell.
Today the one card that can be hidden is **Members**.

> [!IMPORTANT]
> **Hiding is not taking away.** A hidden card only leaves the dashboard. Anyone allowed to see its
> data still can, one link away. To stop someone seeing members, change their role instead.

## Step by step: switching it on

Hiding cards is new, so it sits behind the feature flag `widget.dismissal`. Until it is on, no
**Hide** buttons appear and saved choices hide nothing.

:::steps
### Open the flags

**Platform** → **Feature flags**.

### Turn it on

On `widget.dismissal`, press **Turn on for everyone**, or list the organizations that should get
it first. See [Feature flags](/docs/admin-guide/flags).
:::

## Step by step: hiding a card for yourself

:::steps
### Press Hide

On the dashboard, press **Hide** on the card. It disappears at once and stops loading its data.

### Bring it back

In **Hidden cards**, press **Show again** beside it.
:::

## Step by step: hiding a card for everyone

:::steps
### Open Dashboard cards

**Dashboard cards** in the menu (`/settings/widgets`).

### Press Hide for everyone

Each card that can be hidden shows **Shown** or **Hidden for everyone**, with a button to change
it. It applies straight away. There is no confirmation.
:::

Someone whose admin hid a card sees it in their **Hidden cards** with the badge "Hidden for
everyone by your organization", and no **Show again** button: it is not theirs to bring back.

## Finding out why a card is missing

In **Hidden cards**, open **Why is something missing?**. A table lists every card with the
reason it shows or does not. An owner can see the same table for anyone, from **Members** →
**Access** on their row.

## Who can use it

| Action | Permission |
|---|---|
| Hide and show cards for yourself | everyone signed in (`core.widget.customize`) |
| Hide a card for everyone | `widget.default.manage` (Owner and Administrator by default) |
| See why a card is missing for someone else | `rbac.effective.inspect` (Owner only by default) |

## Good to know

- Your own choice is not recorded in the activity history. An admin's **Hide for everyone** is.
- If you hid a card yourself and an admin then hides and shows it again, it stays hidden for you.
  Your own choice is kept.
- With the flag off, **Dashboard cards** says "Hiding cards is not available for this organization
  yet."
