---
layout: post
title: "Building a Custom Jekyll Theme with Claude Code"
date: 2026-03-05 20:00 +0800
categories: [Tools]
tags: [claude-code, jekyll, frontend]
---

I am not a software engineer focus on fronted area, and I wanted to replace
the minima theme on my Jekyll blog with a custom one -- no frontend experience required. I used
[Claude Code](https://docs.anthropic.com/en/docs/claude-code) to build the entire theme in a
single session.

## What Was Done

### Built a Complete Local Theme

Claude Code read the existing repository structure, fetched the reference design to understand the visual language, and
produced a full theme from scratch:

- 4 layouts: `default.html`, `home.html`, `page.html`, `post.html`
- 4 includes: `head.html` (meta, fonts, dark mode flash prevention), `header.html` (sticky nav,
  theme toggle), `footer.html` (social links), `scripts.html` (theme/nav/mermaid JS)
- 4 SCSS files: `variables.scss` (design tokens), `base.scss` (reset, CSS custom properties for
  light/dark themes), `layout.scss` (all components), `syntax.scss` (code highlighting for both
  themes)

Design: Inter font, JetBrains Mono for code, purple accent (`#6041ed`), CSS custom properties for
theme switching, responsive down to mobile.

### Removed All External Theme Dependencies

Dropped the minima gem from `Gemfile`, removed `theme: minima` from `_config.yml`, and traced
every `site.minima.*` reference across all templates to replace them with direct config paths.

### Made Mermaid Diagrams Built-in

Before: required `mermaid: true` in front matter and `<div class="mermaid">` HTML blocks.

After: mermaid loads automatically on every page. Standard ` ```mermaid ` fenced code blocks work
out of the box -- same syntax as VS Code markdown preview. JavaScript converts Jekyll's rendered
`<pre><code class="language-mermaid">` elements into mermaid divs at runtime. All existing posts
were refactored to the new format.

### Replaced an External Plugin with a Local One

The `jekyll-remote-include` gem (pulled from GitHub) was replaced with a 38-line local plugin in
`_plugins/remote_include.rb`. The local version adds proper HTTP redirect handling and error
reporting. One fewer external dependency.

### Homepage with Author Info and Formatted Post Excerpts

Extracted author bio and project links from the about page into a hero section on the homepage.
Post excerpts render full HTML content (headings, code blocks, lists) inside a CSS height-clamp
with a fade-out gradient, preserving the original article formatting.

### Applied 7 Code Review Suggestions from GitHub Copilot

Gave Claude Code the PR URL. It fetched all Copilot review comments and applied them:

1. Fixed typo: `giscuss` to `giscus`
2. Mermaid dark mode: initializes with matching theme based on site preference
3. Giscus theme sync: sends `postMessage` to iframe on theme toggle
4. Google Analytics: gated behind `jekyll.environment == 'production'`, measurement ID moved to
   `_config.yml`
5. Mobile nav accessibility: added `aria-controls` and `aria-expanded` state updates
6. Social links consistency: unified all templates to use `site.social_links`
7. Homepage excerpts: evaluated the suggestion, kept full content with CSS clamp (with rationale)

## How the Session Worked

The session was iterative. Each prompt built on the previous result:

1. "Create a new theme like this" -- got the base theme
2. "Article briefs should be at least 10 lines" -- adjusted excerpt length
3. "Keep format/line separators in briefs" -- switched to rendering full HTML with CSS height-clamp
4. "Extract about page info to the homepage" -- added hero section with author bio
5. "Make mermaid support built-in" -- refactored mermaid integration and all posts
6. "Clean up all minima information" -- found and removed every trace
7. "Write a local plugin to replace jekyll-remote-include" -- created the plugin
8. "Apply suggestions from Copilot" -- processed 7 review comments

Claude Code ran `bundle exec jekyll build` after every change and verified the output. When it
switched SCSS from `@import` to `@use`, it confirmed deprecation warnings disappeared. When it
created the local plugin, it verified the about page still rendered correctly.

## The Result

The blog now runs on a fully local theme:

- Dark/light mode with system preference detection and localStorage persistence
- Sticky header with responsive mobile navigation and ARIA attributes
- Built-in mermaid via standard fenced code blocks
- Giscus comments synced with site theme
- Production-only Google Analytics
- Syntax highlighting for both light and dark themes
- Zero external theme or plugin gem dependencies

All source lives in the repository. Deployable on GitHub Pages directly.

## Thoughts

The Claude Code's performance was very impressive, and generated theme is enough for me. At least, I don't require work from another people who have front-end experience and wait their jobs. Now, I can use Claude Codew doing it by myself.

