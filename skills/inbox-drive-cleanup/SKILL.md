---
name: inbox-drive-cleanup
description: Triage an overflowing Gmail inbox and clear junk out of Google Drive, safely. Use when someone asks to "get my inbox under control", "clean up my email", "archive old mail", "free up Drive space", or "remove backups / duplicates from Drive". Works through the Gmail and Google Drive connectors, always previews a sample before acting at scale, and never permanently deletes anything without explicit confirmation.
---

# Inbox & Drive Cleanup

A repeatable, check-before-you-act workflow for taming a large Gmail inbox and
reclaiming Google Drive space. It is built around three rules:

1. **Survey before sorting.** Give the person a picture of the mess first.
2. **Ask, then sample, then scale.** Agree on rules, show a sample of what each
   rule would do, and only then apply it to everything.
3. **Trash, never purge.** Gmail Trash and Drive Trash both keep items for 30
   days. Never empty Trash or permanently delete without an explicit "yes" for
   that specific action.

## Prerequisites

- Gmail connector (search, read, label, archive, trash threads).
- Google Drive connector (search, read, trash files).
- If either connector is missing or unauthorized, stop and help the person
  connect it (claude.ai → Settings → Connectors) before doing anything else.

## Part 1 — Gmail

### Step 1: Survey

1. Call `list_labels`. Each system label carries `threadsTotal` and
   `threadsUnread`. Report INBOX, UNREAD and each `CATEGORY_*` tab (Primary,
   Updates, Promotions, Social, Forums). These are exact counts.
   `search_threads` `resultCountEstimate` caps at ~201, so don't use it as a
   count.
2. Measure age with `in:inbox older_than:6m`, `older_than:1y` and
   `older_than:2y`. Read a page of `THREAD_VIEW_SUMMARY` results for each to see
   what is there.
3. Identify the top senders by type:
   - **Newsletters**: digests, Substack, beehiiv, market recaps
   - **Promotions**: retail, travel, bank cross-sell, course/webinar marketing
   - **Notifications**: OTPs, transaction alerts, social invites, job alerts,
     calendar digests, webinar reminders
   - **People**: a human sender with no `noreply`, `newsletter`, `marketing` or
     `mailer` in the address
4. Present a short table plus a culprit list. Don't act yet.

### Step 2: Ask how they want it organized

Ask, in one round:
- **Labels**: reuse existing user labels where they fit (e.g. Finance,
  Newsletters, Learning, Jobs), and add a `To Reply` label for people.
- **Old-mail policy**: archive only / archive + trash promos / trash
  aggressively (promos, newsletters, social, OTPs, expired reminders).
- **VIP senders**: who must never be archived (real people, banks, security
  alerts, orders, named contacts).

### Step 3: Sample the old stuff first

Start with mail older than 6 months, because it is the safest to clear. Build a
sample of about 10 per bucket and show it as a table (sender · subject · date ·
proposed action · reason):

| Action | Typical matches |
|---|---|
| **Trash** | `category:promotions`, expired OTPs, past webinar/event reminders, "you have no events today", social invites, job-alert digests |
| **Archive + label** | bank/broker statements → Finance; newsletters → Newsletters; course mail → Learning |
| **Flag for reply** | human senders with an unanswered question, invitations, interview requests → `To Reply`, kept in inbox |
| **Keep** | anything from a VIP sender |

Wait for the person to approve or adjust the rules.

### Step 4: Apply at scale

- Work query by query. Example: `in:inbox older_than:6m category:promotions`.
  Paginate with `THREAD_VIEW_IDS_ONLY` and `pageSize: 50`.
- Archive = `unlabel_thread` with `INBOX`. Label = `label_thread`. Trash =
  `trash_thread`.
- Exclude VIPs in the query itself (`-from:...`) instead of filtering later.
- Send tool calls in small batches. Large parallel bursts can drop the
  connection. Re-check state after any interruption instead of resending blindly.
- Report progress per bucket (counts moved), then move on to newer mail with the
  same rules.

### Step 5: Keep it clean

Offer Gmail filter rules that mirror the agreed buckets (e.g.
`from:(*@courses.maven.com) → skip inbox, label Learning`) so new mail sorts
itself.

## Part 2 — Google Drive

### Step 1: Find candidates

Search only the person's own files (`owner = 'me'`):
- Names containing `backup`, `copy`, `Copy of`, `(1)`, plus zip/compressed
  archives
- Camera proxy/sidecar files: DJI `.LRF` (low-res previews), `.THM`, `.AAE`
- Exact duplicates: same title + size, or duplicated form/sheet pairs
- Empty `Untitled …` docs, sheets, forms and scripts

### Step 2: Verify each candidate

Never trust the name alone:
- **Proxy files** (`.LRF` etc.): trash one only if its full-quality original
  (same base name, `.MP4`/`.JPG`) also exists in Drive. If the original is
  missing, the proxy may be the only copy, so keep it.
- **"Untitled" files**: read the content snippet. Trash only truly empty ones.
  Untitled files often hold real drafts.
- **Duplicates**: compare contents and response counts. If both copies look
  identical and you can't tell which one is live (e.g. which form link was
  shared), ask before trashing either.
- **Scripts**: an Apps Script created alongside a form/sheet may power it, so
  ask before trashing it.

### Step 3: Confirm and trash

List the verified files with sizes and the total space saved, get a yes, then
call `trash_file` one at a time or in small batches. Remind the person that
Drive Trash still counts toward storage until it is emptied, and that emptying
it is permanent. Only they should decide to do that.

## Final report

End with:
- What was done (counts per action, space reclaimed)
- What was deliberately kept, and why
- Open questions for the person
- Suggested filters / habits to keep things clean
