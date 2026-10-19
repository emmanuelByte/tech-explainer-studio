# How Does a Database Find 1 User Among 1 Million?

**Category:** Database Engineering / System Design  
**Estimated duration:** 3–4 minutes  
**Audience:** Developers, computer science students, and curious beginners  
**Visual theme:** Premium animated technical diagrams, dark background  
**Status:** Approved for agent production

> **Production agent:** This file contains the approved narration and separate visual-production instructions. Speak **only** the text in each **Narration** section, preserving its wording. The **Animated Visual** and **Creative Direction** sections are production guidance, not spoken dialogue. Read `AGENTS.md`, `docs/AUTHORING_GUIDE.md`, and `docs/PRODUCTION_PIPELINE.md` before producing. Use the existing engine. Do not redesign unrelated features.

## Creative Direction

This video must demonstrate how database indexing works through **clear, engaging, animated diagrams**.

The current default diagrams in Tech Explainer Studio are below our desired visual standard. The production agent should find, create, or improve visual assets to achieve professional, visually compelling results.

Diagrams must be designed for animation, with individually controllable elements, progressive reveals, moving search indicators, highlighted paths, smooth transitions, and meaningful camera movements.

Use consistent typography, polished vector artwork, clear technical labels, and restrained accent colors.

**Important:** The animations must explain what the narration is describing. Avoid static diagrams, generic boxes, decorative movement, and slides filled with text.

---

## Scene 1: One User Among a Million

### Narration

Imagine a database containing one million users.

Now, someone tries to log in using their email address.

Your backend sends a query to the database, asking for one specific account.

But here's the question.

How does the database find that one user among a million records?

Does it check every single row?

Or is there a smarter way?

### Animated Visual

Open with a dramatic visualization of a database containing thousands of rows. The row count accelerates until it reaches **1,000,000**.

An SQL query appears:

```sql
SELECT * FROM users
WHERE email = 'alex@example.com';
```

The query travels into the database. The camera zooms across the enormous table, emphasizing how difficult locating one row could be.

Highlight the target email as the central mystery.

---

## Scene 2: Searching Without an Index

### Narration

Let's imagine there's no index on the email column.

PostgreSQL might perform what's called a sequential scan.

It reads through the table, checking each row to see whether the email matches.

And even if it finds Alex, it may still need to check the remaining rows, because there could be other matches.

Now imagine doing that across a million records.

That's a lot of work just to answer one query.

### Animated Visual

Present a large, visually polished database table.

A scanning indicator moves progressively through the rows, checking each email.

Non-matching rows briefly dim or turn red.

The matching row illuminates, but the scan continues, demonstrating why finding one match doesn't necessarily finish the query.

Animate a **Rows Examined** counter increasing rapidly.

The table should feel enormous without attempting to display one million individual rows.

---

## Scene 3: Introducing the Database Index

### Narration

This is where database indexes come in.

Think about the index at the back of a textbook.

If you're looking for a particular topic, you don't read every page from the beginning.

You find the topic in the index, which tells you where to look.

A database index works on a similar idea.

It organizes searchable values so the database can find the relevant records without scanning the entire table.

### Animated Visual

Transition from the chaotic table scan to an elegant side-by-side diagram.

On one side, show the original users table.

On the other, reveal a separate organized index structure.

Use a brief textbook-index animation to establish the analogy, then transform it into a database index.

Show how searchable email values relate to record locations.

The index and table must remain visually distinct.

---

## Scene 4: Inside a B-tree Index

### Narration

But how does the index actually organize all these values?

In PostgreSQL, the default index type is a B-tree.

A B-tree organizes sorted values across connected pages.

Each page can contain multiple keys that help guide the search.

Instead of examining every email address, PostgreSQL can use those keys to narrow down where the matching value should be.

Let's see how.

### Animated Visual

Transform the index representation into a beautifully animated **B-tree structure**.

Start with the root page.

Reveal multiple child pages connected through smooth, animated branches.

Each page should contain several ordered keys, rather than being represented as a binary tree with one key per node.

Clearly distinguish the root, internal pages, and leaf pages.

The tree should occupy the screen elegantly, adapting to portrait and landscape formats.

---

## Scene 5: Finding Alex in the B-tree

### Narration

Remember, we're searching for alex@example.com.

PostgreSQL starts at the root of the B-tree.

It compares our search value with the keys stored there.

Those keys tell it which branch to follow.

At the next level, it repeats the process, narrowing the search even further.

Eventually, it reaches the leaf entry containing Alex's email.

That entry includes a reference to the corresponding row in the original table.

PostgreSQL follows that reference, retrieves the user, and returns the result.

And just like that, we've found our record without scanning a million rows.

### Animated Visual

This is the **hero animation of the entire video**.

Display the search value above the B-tree.

Animate the actual search step by step:

The search enters the root page. Relevant keys highlight, and irrelevant branches fade into the background.

A luminous path travels to the correct child page, continuing through the tree until it reaches the matching leaf entry.

Then the camera follows an animated connection from that leaf entry to the corresponding users-table row.

The full user record expands into view.

Every highlighted comparison and branch selection must be technically consistent with the keys shown.

This sequence should feel like the viewer is watching the database execute the lookup.

---

## Scene 6: Full Scan vs Indexed Lookup

### Narration

Now let's compare the two approaches.

Without an index, PostgreSQL may examine the entire table to find matching rows.

With a suitable B-tree index, it can navigate through a much smaller number of index pages to locate the record.

For a selective query against a large table, that can dramatically reduce the work required.

That's why a well-chosen index can make such a big difference.

### Animated Visual

Create a compelling side-by-side comparison.

**Left: Sequential Scan**

Animate a search indicator moving through many table rows, with a rapidly increasing examination counter.

**Right: B-tree Index Scan**

Animate the root-to-leaf search, followed by a single highlighted table-row lookup.

Keep both animations synchronized so viewers can directly compare the amount of work.

Avoid fabricated execution-time benchmarks. Demonstrate the difference in search strategy and the number of elements examined.

---

## Scene 7: The Hidden Cost of Indexes

### Narration

But here's something important.

Indexes aren't free.

First, they consume additional storage.

And whenever you insert a new record, the database may also need to add an entry to the index.

If you change an indexed email address, the index needs updating too.

Deleting records also involves index maintenance.

So while indexes can make reads faster, they introduce extra work when data changes.

That's why creating an index on every column isn't always a good idea.

### Animated Visual

Show the table and B-tree index together.

Animate three operations:

**INSERT:** A new user enters the table, followed by the corresponding index entry.

**UPDATE:** An email changes, and its index entry is adjusted.

**DELETE:** A user is removed, illustrating the corresponding index-maintenance work.

Finish with an elegant animated trade-off:

**Faster selective reads ↔ Extra storage and write overhead**

Keep these operations conceptual rather than depicting an incorrect instantaneous physical deletion algorithm.

---

## Scene 8: Why PostgreSQL Might Ignore Your Index

### Narration

And here's one more interesting detail.

Just because an index exists doesn't mean PostgreSQL will always use it.

Suppose your query needs almost every row in the table.

Following the index and repeatedly fetching table rows could actually cost more than simply scanning the table in sequence.

So PostgreSQL has a query planner that estimates the cost of different approaches.

It chooses the plan it expects to be most efficient.

The best strategy depends on the query and the data.

### Animated Visual

Introduce the PostgreSQL query planner as a decision mechanism.

On one side, show a query matching a very small number of users.

On the other, show a query matching most of the table.

Animate the planner comparing two paths:

- Selective lookup: B-tree index scan
- Large result set: sequential scan

Show the chosen path becoming illuminated for each case.

Present this as a cost-based decision, not a fixed rule based solely on row count.

---

## Scene 9: Final Takeaway

### Narration

So, how does a database find one user among a million?

With a useful index, it can follow an organized search path instead of checking every row.

In PostgreSQL, a B-tree makes that possible by narrowing the search through sorted keys until it reaches the matching entry.

But indexes come with trade-offs: extra storage and additional work when data changes.

The real skill is knowing which columns to index, based on the queries your application actually runs.

And that's how databases can find a needle in a million-row haystack.

### Animated Visual

Bring back the original one-million-row database from the opening.

Replay the entire indexed lookup as a single smooth animated sequence:

**SQL Query → B-tree Traversal → Matching Index Entry → Table Row → Result**

The camera pulls back to reveal the whole process.

Finish with the final statement:

**A good index helps your database find the right data with less work.**

Fade out cleanly.

---

## Final Production Notes for Codex / Claude Code

**Narration:** Preserve the approved narration exactly. Visual directions are instructions, not spoken dialogue.

**Diagrams:** Design or source high-quality, motion-ready vector illustrations. Do not automatically reuse existing component diagrams if their visual quality is inadequate.

**Animation:** Prefer progressive construction, animated search paths, precise highlights, smooth camera movements, and scene-to-scene visual continuity.

**B-tree accuracy:** Represent multi-key pages, valid key ordering, correct branch selection, and the final row reference. Do not substitute a binary search tree.

**Technical accuracy:** Sequential scans should not be presented as always stopping at the first match. Index usage is decided by PostgreSQL's query planner.

**Styling:** Dark Sketch as the base theme, upgraded with a professional, polished visual language.

**Outputs:** Native 1080×1920 and 1920×1080, with synchronized captions, narration, and animations.

**Production engine:** https://github.com/emmanuelByte/tech-explainer-studio

Follow `AGENTS.md`, `docs/AUTHORING_GUIDE.md`, and `docs/PRODUCTION_PIPELINE.md`.

Avoid unnecessary engine development. Focus on creating an excellent video from this lesson.
