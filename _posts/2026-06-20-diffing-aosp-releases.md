---
layout: post
title: "Diffing AOSP Releases"
date: 2026-06-20 00:00 +0800
tags: [aosp, android, tooling, git, manifest, ai-assist]
---

Every time a new Android version lands I want the same narrow thing: which
repositories changed, and which of those changes are worth opening the source
for. AOSP is a few hundred git projects stitched together by a `repo` manifest,
so "what's new in Android 17" is never one diff. It's the union of a few hundred
per-project diffs, almost all of them routine, a handful of them the actual
story.

I got tired of eyeballing the manifest by hand, so for the [AOSP Internals
book](https://github.com/aospbooks/) I wrote a small tool to answer the question
mechanically. It lives in the book repo as `tools/manifest_snapshot.py`, and its
output lands under `manifest-snapshots/`. This post is how it works, and how the
mechanical part hands off to the part that can't be automated: reading the
source.

## Why diff by manifest

A `repo` manifest pins every project to a remote and a revision. After
`repo sync` on a release branch, each project sits on one commit. So a release
is just a mapping from project path to commit SHA, and the difference between two
releases is four buckets:

- **Added** — paths in the new release that weren't in the old one.
- **Removed** — paths that were in the old release and are gone.
- **Moved** — same path, different SHA.
- **Unchanged** — same path, same SHA.

That split is the whole tool. Once you know a project moved, the local git object
store already has both endpoints, so `git log old..new` gives you the exact
commits that landed there. No network, no guessing. The manifest is the index;
git holds the bodies.

## snapshot → compare → history

Four subcommands, three steps.

### `snap` — pin a release

```bash
python3 tools/manifest_snapshot.py snap --aosp-root $ANDROID_BUILD_TOP
```

`repo manifest -r --pretty` resolves every project to its current HEAD SHA, and
the tool writes that pinned XML plus a small `metadata.json` under
`manifest-snapshots/<branch>/<date>/`. One `repo manifest` call, no history walk,
so it's quick. A snapshot is the project-to-SHA mapping for one release, frozen
so you can diff against it later.

The metadata records only portable facts:

```json
{
  "schema_version": 1,
  "captured_at": "2026-06-19T11:20:56+00:00",
  "captured_at_unix": 1781889656,
  "default_revision": "android17-release",
  "default_remote": "aosp",
  "manifest_branch": "android17-release",
  "repo_version": "v2.54",
  "label": "android17-release",
  "notes": ""
}
```

`aosp_root`, `host`, `hostname`, `user`, and `cwd` are rejected by a validator,
not just omitted, so a committed snapshot can't leak where it was taken.

### `history` — every commit, per repo

```bash
python3 tools/manifest_snapshot.py history --aosp-root $ANDROID_BUILD_TOP
```

This walks `git log` across every non-shallow project and writes one flat file,
`manifest-snapshots/_history/<branch>_<date>.history.txt`: a header, the skipped
list, then one section per repo with its SHA and full `<sha> <subject>` log. It's
slow (minutes) and big (hundreds of MB on a full tree). The reason to bother is
that it captures each release's commit list on its own, which the next step
needs.

### `compare` — the diff

```bash
python3 tools/manifest_snapshot.py compare \
    manifest-snapshots/<branchA>/<dateA> \
    manifest-snapshots/<branchB>/<dateB> \
    --aosp-root $ANDROID_BUILD_TOP
```

`compare` sorts projects into added/removed/moved/unchanged, then for each moved
project runs `git log --no-merges --pretty=oneline old..new` against the local
`.repo/projects/<path>.git`. `compare-history` does the same job from two
`history` files plus the newer snapshot, set-diffing the two SHA lists into "new
in B" and "dropped from A" per repo. Reach for `compare-history` when the two
sides were captured at slightly different sub-revisions: it keeps the project list
and the commit lists from the same source instead of mixing one release's SHAs
with another's log.

Either path produces one directory per comparison:

```
manifest-snapshots/_compare/<oldrev>-to-<newrev>/
  report.md           navigator: summary, moved-by-group, skipped, added/removed tables
  changes.txt         per-repo commit lists (NEW / DROPPED blocks)
  added-removed.txt   added/removed projects, with full inline history
```

## Three artifacts, two of which you never read whole

The split across those three files is the one design decision I'd defend hardest,
and it's purely practical: one file is meant to be read top to bottom, and the
other two never are.

**`report.md` is the navigator.** A few hundred KB, safe to read straight
through. It opens with a summary table, then the moved projects bucketed by their
manifest module group, then the skipped list and the added/removed tables. A
moved-projects row looks like this:

```
## Moved projects by module group

### Group: _ungrouped

| Project | Path | new | dropped | Compare |
|---|---|---|---|---|
| platform/packages/apps/UniversalMediaPlayer | `packages/apps/UniversalMediaPlayer` | 1 | 0 | <https://android.googlesource.com/platform/packages/apps/UniversalMediaPlayer/+log/520a29df..08d2f325> |
```

Path, commit count, and a Googlesource compare link per project. Start here. It
tells you where to look without dropping a single commit body in your lap.

**`changes.txt` is the body, and it's too big to open.** It's a
kernel-changelog-style dump of every moved project's commits, tens of MB. Grep the
one repo you care about:

```bash
D=manifest-snapshots/_compare/<dir>
grep -n -A 60 '^frameworks/base   (' $D/changes.txt | head -80
```

The section that lands on:

```
frameworks/base   (platform/frameworks/base)
old 45034f0663f960d9ee5fb0a101a4732b71f6e2f4  ->  new 94b4c163b7dfe5ce3607f7bb8456f9573f7de57d
-----------------------------------------------------------------
NEW (15196):
  e164d9a65f3e... Fix ActiveServicesTest compile failure by adding back import files
  9dfed79281a8... Make ContextLogger do all of its work on the executor
  b2b726fd471b... Fix privileged permission allowlist lookup in PackageManagerShellCommand
  ...
```

15,196 commits in one repo's `NEW` block is the whole argument for grepping the
section you want instead of opening the file. Each header is `<path>   (<name>)`,
followed by `NEW (n):` (plus `DROPPED (m):` for `compare-history`).

**`added-removed.txt`** carries the full inline history of each added and removed
project, so you can read a brand-new repo from its first commit. The header for an
added project, here the SDV reference device that showed up in 17:

```
## ADDED (84)
================================================================
device/google/sdv   (device/google/sdv)
sha f4bfa128d5d9fb21adca8430694cc16c90b6144a   groups: swcar, pdk
-----------------------------------------------------------------
```

Same rule: grep the one you're after.

## A concrete example: android-16 → android-17

Running this for the book against the real tree produced
`manifest-snapshots/_compare/android-16.0.0_r4-to-android17-release/`. The summary
in `report.md`:

| Category | Count |
|---|---|
| Moved | 696 |
| Added | 84 |
| Removed | 11 |
| Unchanged | 206 |
| New commits (total) | 137470 |
| Dropped commits | 715 |

137,470 commits is not a number anyone reads. The navigator's job is to make it
irrelevant. You scan the moved-by-group tables, spot the projects with outsized
commit counts (`platform/art` around 890, `build/soong` around 1040,
`external/angle` around 1335), and read the added table for genuinely new
capabilities. That's where a new external dependency like `external/acpica` shows
up as a signal that some platform feature arrived, not as code you have to digest
line by line.

## Handing off to source reading

The diff isn't the answer. It's the targeting system. It tells you, with no
ambiguity, which projects and which commits changed, which is exactly what you
need to read the right source instead of wandering the tree.

The workflow I settled on has two phases. First the tool produces the changeset,
the three artifacts above, mechanical and reproducible. Then a human, or an agent
team, reads source for the high-signal repos: open the actual files in the new
release for each project the navigator flagged, and write up what the change is
and why it matters, citing real paths.

I optimize for accuracy over coverage. A small writeup where every claim is
checked against source beats a broad one that paraphrases commit subjects and
quietly gets things wrong. The diff narrows "all of AOSP" down to "these 696
moved repos, ranked by commit volume and grouped by subsystem," and you read
source from there. Never the reverse.

One gap is easy to miss. A project-level diff catches new projects, but the
changes I most want are often new modules added inside a repo that merely moved.
A new system service in `frameworks/base` never appears as an added project. So
the source pass also greps the `NEW` commit subjects of the high-signal moved
repos for "add … service/module/manager/daemon" and checks each hit against
source. The diff is a cheap index into where to look; reading source is what makes
a claim trustworthy.

## The AI tasks it feeds

I built this for the book because "update the book for Android 17" is a hopeless
thing to hand an agent directly. There's no boundary and no way to check the
result, and an LLM asked what changed in AOSP will produce a confident, plausible,
wrong answer. The changeset turns that one unbounded request into a pile of small,
bounded, checkable tasks. That's the only reason the AI side works at all.

The tasks the three artifacts drove on the Android 17 pass:

- **Prioritize.** `report.md` ranks moved projects by commit volume, so the agent
  team spends effort where the release actually changed (`platform/art`,
  `build/soong`, the graphics stack) instead of re-reading chapters whose repos
  barely moved.
- **Find what's new.** The added table, plus a grep of the `NEW` subjects of
  high-signal moved repos for "add … service/module/manager/daemon", feeds a
  gap-analysis pass that finds capabilities with no chapter yet. That's how the
  pass turned up the Software Defined Vehicle platform, the NPU Manager module,
  the LFI in-process sandbox, and a Trusty TEE target for the new Android Desktop
  form factor. None of those surface if you only re-read the chapters you already
  have.
- **Rewrite, then disbelieve.** For each flagged chapter, one agent rewrites the
  prose against the source the diff pointed at. A separate reviewer agent opens
  every cited path and checks the claim against this release, and another renders
  the diagrams to catch the ones that parse cleanly but draw the architecture
  wrong. The author wants to ship; the reviewer wants to disbelieve. Splitting
  them is what catches the confident mistake.

The thread through all of it: the diff is the leash. Every task an agent gets is
scoped to "these repos changed, here are the commits," never "all of AOSP," so its
context stays small and its output stays checkable against a specific file. The
mechanical changeset is what keeps the AI honest, the same job the verify scripts
and source citations do in the [harness patterns I wrote about
earlier](/2026/04/26/using-claude-code-on-aosp-scale-projects.html). Without it
you're trusting an agent's gut feeling about a 137,470-commit diff, which is the
one thing you should never do.

## The rules that keep it correct and safe

These are the invariants the tool depends on. Break one and the output is either
wrong, or the run damages your checkout.

- **Read-only against the tree, always.** Every subcommand runs only
  `repo manifest -r` and `git log`. It never fetches, gcs, commits, or touches
  refs; `snap` writes only inside `manifest-snapshots/`. The test suite asserts
  this as an invariant.
- **Don't read `changes.txt` or `added-removed.txt` whole.** Tens of MB each. Grep
  the one repo section (`^<path>   (`). `report.md` is the only file you read end
  to end.
- **Don't `repo gc` between the two syncs.** For full-depth projects, switching the
  checkout to the newer release leaves the older SHAs in the object store, so
  `compare` can run `git log old..new` offline. A gc or prune in between deletes
  those objects, and the repo falls back to a Googlesource link instead of a real
  commit list.
- **Keep the snapshot and the history coherent.** A snapshot and a history file can
  sit on slightly different sub-revisions, with different SHAs. Don't mix one
  release's SHAs with another's commit lists — use `compare-history` so the project
  set and the commit lists come from the same place.
- **Slugify ref-name revisions.** A default revision is often a tag like
  `refs/tags/android-16.0.0_r4`. Flatten the slashes so it becomes one safe path
  component instead of nested directories.
- **Decode git output as bytes.** Old and imported commit subjects carry raw
  non-UTF-8 bytes. Decode with `errors="replace"` or the run dies partway through.
- **Skip what you can't fairly diff.** Shallow projects (a manifest `clone-depth`,
  or a live `.repo/projects/<path>.git/shallow` marker) can't be diffed across a
  branch switch, so they're listed as skipped rather than run through `git log`.
  `manifest-snapshots/ignore-globs.txt` filters obvious noise like `prebuilts/*`
  and `toolchain/*`.
- **Treat `external/*` as a signal, not a changelog.** A new `external/*`
  dependency means a platform capability arrived. Describe what pulled it in and
  why, not its internal history.
- **Verify every source claim independently.** Whatever the diff suggests, the
  writeup earns trust only when a separate pass opens each cited path in the real
  tree and confirms the claim for that release. The diff points; source confirms.

## What it doesn't do

It's deliberately small. It doesn't parse commits semantically, group changes by
feature, or tell you what a change means. That's the source-reading phase, and I
don't think it should be automated. It also leans on the local object store: if
you've already gc'd, or only have a shallow clone of the older release, moved
projects degrade to Googlesource links, fine for browsing but useless for grep.
And it says nothing about prebuilts or anything else `ignore-globs.txt` filters
out, on purpose.

## Closing

A manifest is a clean, machine-readable index of a release, and a release diff is
a set difference over project-to-SHA mappings plus a `git log` per moved project.
`tools/manifest_snapshot.py` does that reproducibly, and the three files under
`manifest-snapshots/_compare/` turn "what changed in Android 17" from an
unanswerable 137,470-commit question into a ranked, grepped list of which source
to open next. Finding *where* is the easy half. Reading the source, with every
claim checked, is still the half that matters.
