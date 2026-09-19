# frozen_string_literal: true

# Sets page.last_modified_at for each post to the date of the newest commit that
# changed the post's body. Commits that only touch front matter (tags,
# categories, layout flags) are ignored, so bulk metadata edits do not mark
# every post as edited. Uncommitted body changes count as edited now, which
# keeps local previews honest. A last_modified_at set in front matter wins.
#
# CI must check out full history (fetch-depth: 0) or every post looks new.

require "open3"
require "time"

module LastEdited
  FRONT_MATTER = /\A---\s*\n.*?\n---\s*\n/m.freeze

  module_function

  def body(text)
    text.to_s.sub(FRONT_MATTER, "").gsub(/[ \t]+$/, "").strip
  end

  def git(dir, *args)
    out, _err, status = Open3.capture3("git", "-C", dir, *args)
    status.success? ? out : nil
  end

  # Newest-first list of [sha, committed_at, path_at_that_commit].
  def history(dir, relpath)
    log = git(dir, "log", "--follow", "--format=%x00%H %cI", "--name-only", "--", relpath)
    return [] unless log

    log.split("\0").reject(&:empty?).map do |entry|
      header, *files = entry.strip.split("\n").reject(&:empty?)
      sha, date = header.split(" ", 2)
      [sha, Time.parse(date), files.last || relpath]
    end
  end

  def show(dir, sha, path)
    git(dir, "show", "#{sha}:#{path}")
  end

  def last_body_change(dir, relpath, working_text)
    commits = history(dir, relpath)
    return nil if commits.empty?

    newest_sha, _, newest_path = commits.first
    if body(working_text) != body(show(dir, newest_sha, newest_path))
      return File.mtime(File.join(dir, relpath))
    end

    commits.each_cons(2) do |(sha, date, path), (older_sha, _, older_path)|
      return date if body(show(dir, sha, path)) != body(show(dir, older_sha, older_path))
    end
    nil # only the commit that created the post
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  dir = site.source
  next unless LastEdited.git(dir, "rev-parse", "--is-inside-work-tree")

  site.posts.docs.each do |post|
    next if post.data.key?("last_modified_at")

    relpath = post.relative_path
    edited = LastEdited.last_body_change(dir, relpath, File.read(post.path))
    post.data["last_modified_at"] = edited if edited
  end
end
