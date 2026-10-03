## What it is

The **stream process** (`apps/realtime`, port 13001 on your machine) keeps one live line open to
every browser tab. When something changes, it tells the tab straight away, so the bell, the inbox
and an open conversation update without a refresh.

## Why it exists

Without it, every page would have to ask the server "anything new?" over and over. Holding
thousands of open lines is a different job from answering clicks, so it runs as its own program
and never slows the web app down.

## How it works

:::steps
### Something happens

A message is sent, or a notification is created.

### It is announced

The web app or the worker publishes a short note through Redis.

### The stream passes it on

The stream process hands the note to every open tab that may see it, within about a second.
:::

Each signed-in person has two kinds of line:

| Line | Carries | Open while |
|---|---|---|
| **Your own** | the bell and the conversation list | any page is open |
| **A conversation** | its new messages, and "… is typing…" | that conversation is open |

## The rules it keeps

- **Access is re-checked every 60 seconds.** Deactivate someone, remove them from a conversation
  or take away their permission, and their open line closes within a minute and cannot reopen.
- **A dropped line reconnects by itself** after 2 seconds, and catches up on what it missed: each
  conversation keeps its last 200 updates for an hour. Away longer than that, the page reloads its
  data instead. "Typing" notes are never replayed.
- **A line lasts at most 30 minutes**, then closes and reopens on its own. Each person may have up
  to 8 lines open at once; more are refused.

## Good to know

- It reads its notes from the cache Redis, unless `REDIS_REALTIME_URL` gives it a Redis of its own.
- **If it is down, nothing breaks.** Pages still load and save; they just stop updating by
  themselves until a refresh. **Platform** → **Status** shows it as the **Realtime fan-out** row.
- Its limits are set in `.env`: `REALTIME_MAX_STREAMS_PER_USER` and
  `REALTIME_STREAM_MAX_AGE_SECONDS`.
