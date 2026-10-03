## What it is

Short messages about things that happened, such as "someone joined" or "your role changed". They
arrive live on the **bell**, in the **inbox**, and by email.

## The bell

The bell in the header shows how many are unread (**99+** past 99). Click it to see the latest five
unread, each with **Mark read**, and **See all notifications**.

## The inbox

At `/notifications`: every notification, newest first.

- **Unread only** hides what you have seen.
- **Mark all as read** clears the count.
- **Load older** shows more.

## What you are told about

| Notification | Who gets it | By default |
|---|---|---|
| Someone joined | members who can invite | in the app straight away, email once a day |
| Your role changed | the person whose role changed | both straight away |
| New message | the other person in a direct message | in the app straight away, email once a day |

You are never notified about your own actions.

> [!NOTE]
> **"New message" comes once per conversation.** While one is unread, more messages in the same
> conversation add no second one. Opening the conversation does not clear it; press **Mark read**.
> Messages in a group conversation send no notification at all.

## Step by step: choosing how you hear

:::steps
### Open preferences

Type `/settings/notifications` after the app's address. The page is titled "How you hear from
us". No menu links to it yet, so bookmark it.

### Pick per row

Each kind has a row for **In the app** and one for **By email**: **People and roles** and
**Messages**. Choose **Straight away**,
**Once a day** or **Off**. It saves as you click.
:::

> [!NOTE]
> Turning **In the app** off only stops the live alert. The notification still lands in the inbox.

## Older than a year

Notifications are kept in the main database for 12 months. After that, each month moves to cold
storage (see [Retention](/docs/admin-guide/retention)). They can still be read:

:::steps
### Open the inbox

**Notifications**, at `/notifications`. Below the live list is **Older than a year**: "Read
straight out of cold storage. Nothing to restore and nothing to wait for."

### Pick a month

Choose from **Month**. Only months that were archived are offered. Each person sees only their
own notifications from that month, with **Load more** for the rest.
:::

This section needs `notification.archive.read`, which only **Owner** holds by default: each read
fetches a whole month of the organization from storage. With nothing archived yet, it says
"Nothing of yours has been archived yet."

## The daily digest

At **07:00 UTC** each day, each person with unread notifications from the day before gets one email,
"Your daily digest — … updates". Nobody gets an empty one.

## How "live" works

The stream process keeps a line open to each browser tab. When something happens, the bell and any
open list refresh by themselves within about a second.

## Who can use it

`notification.inbox.read` to see notifications, `notification.inbox.update` to mark them read, and
`notification.preference.update` to change preferences. Every built-in role except Guest has all
three.
