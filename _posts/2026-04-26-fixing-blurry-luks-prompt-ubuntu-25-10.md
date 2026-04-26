---
layout: post
title: "Fixing the blurry LUKS password screen after upgrading to Ubuntu 25.10"
date: 2026-04-26 00:00 +0800
tags: [ubuntu, linux, plymouth, luks, grub]
---

After upgrading from Ubuntu 25.04 to 25.10, I noticed something annoying: the disk-encryption password screen that appears right after the firmware logo had become noticeably low-resolution. The motherboard logo was fuzzy, the password field looked like it had been stretched from 800×600, and the whole thing felt like a regression from the crisp screen I had on 25.04.

If you've run into the same thing, here's what's actually going on and how to fix it.

## Which screen are we talking about?

There are a few screens during boot, and it helps to be precise:

- **The UEFI/BIOS firmware screen** — the very first thing you see, with the motherboard or laptop vendor logo. This is rendered by the firmware, not by Linux.
- **Plymouth** — Ubuntu's boot splash. When your disk is encrypted with LUKS, Plymouth draws the passphrase prompt on top of its splash background.
- **GDM** — the graphical login screen where you type your *user* password to enter the desktop.

The blurry one in this story is **Plymouth**, specifically the LUKS passphrase prompt it renders early in boot.

## How to confirm Plymouth is what's drawing the screen

Plymouth is sneaky because it inherits the firmware's logo on Ubuntu by default, so it can look like the firmware splash never went away. You can confirm Plymouth is in play with a few quick checks:

```bash
# Is Plymouth installed?
dpkg -l | grep -i plymouth

# Is the splash flag on the kernel command line?
cat /proc/cmdline

# Is Plymouth bundled into the initramfs (which runs at the LUKS prompt)?
lsinitramfs /boot/initrd.img-$(uname -r) | grep -i plymouth

# Did the daemon start during boot?
systemctl status plymouth-start.service
```

If you see Plymouth packages installed, `splash` on the kernel command line, Plymouth files in the initramfs, and a successfully started `plymouthd`, that's your answer.

There's also a satisfying live test: at the LUKS prompt, press `Esc`. The graphical splash disappears and you drop to the plain text `cryptsetup` prompt underneath. That confirms Plymouth was the layer on top.

## Why the default theme uses the motherboard logo

Ubuntu's default Plymouth theme is `bgrt`, which stands for **Boot Graphics Resource Table** — a UEFI/ACPI table where the firmware stashes its own boot logo. The `bgrt` theme reads that table and reuses the firmware's logo as the splash background. That's why you see motherboard branding during the LUKS prompt instead of an Ubuntu logo.

It's a clever idea, but it has a built-in tradeoff: the BGRT bitmap is whatever resolution the firmware decided to ship, which is usually small. On a 2K or 4K display, it scales up and looks soft.

## Why did 25.10 make it worse?

The blurry-screen-after-upgrade issue almost always comes down to one of these:

1. **`/etc/default/grub` got reset.** During a release upgrade, `dpkg` notices the maintainer's version of the file has changed and asks whether to keep yours or take theirs. If the new version was accepted, custom settings like `GRUB_GFXMODE` and `GRUB_GFXPAYLOAD_LINUX=keep` are wiped. This is the single most common cause.
2. **The initramfs gets regenerated from scratch.** Any tweaks that lived only in the old initramfs are gone. If your previous setup relied on a kernel module (like `amdgpu` or `i915`) being included early enough for kernel mode-setting to take over before Plymouth, the splash falls back to the firmware's GOP framebuffer — often 1024×768.
3. **Kernel/driver timing changed.** A newer kernel can change *when* the GPU driver activates. If KMS used to kick in early enough that Plymouth got the native resolution, but now loads slightly later, Plymouth ends up rendering on the smaller GOP framebuffer.

You can check whether `/etc/default/grub` was overwritten:

```bash
ls -la /etc/default/grub*
```

If you see a `grub.dpkg-old`, that's your previous version, and `sudo diff /etc/default/grub.dpkg-old /etc/default/grub` will show exactly what the upgrade changed.

## The fix

The fix has two parts: make GRUB hand a high-resolution framebuffer to the kernel, and make sure the kernel keeps it instead of resetting to a low-res default.

Edit `/etc/default/grub`:

```bash
sudo nano /etc/default/grub
```

Set:

```
GRUB_GFXMODE=1920x1080,auto
GRUB_GFXPAYLOAD_LINUX=keep
```

The `,auto` is a fallback — if 1080p isn't available via your firmware's GOP, GRUB picks the best mode it can find instead of failing.

`GRUB_GFXPAYLOAD_LINUX=keep` is the critical part — it tells the kernel to *keep* GRUB's framebuffer instead of resetting before Plymouth starts.

Apply both:

```bash
sudo update-grub
sudo update-initramfs -u
```

Then reboot.

## Theme choice: a tradeoff

While debugging, you might be tempted to switch to the `spinner` theme. That's a clean, resolution-independent Plymouth theme, and it does look sharp — but it draws its own background and ignores the BGRT table entirely, so the motherboard logo disappears. Pick your fighter:

- **`bgrt`** keeps the OEM logo but is limited by the BGRT bitmap's resolution.
- **`spinner`** is sharp at any resolution but has no OEM branding.
- **A custom theme** can use a high-resolution copy of any logo you like as the background.

To switch themes:

```bash
sudo update-alternatives --config default.plymouth
sudo update-initramfs -u
```

The second command is essential. The alternatives change alone doesn't take effect at the LUKS prompt, because Plymouth runs from the initramfs — and the initramfs still contains the old theme until you rebuild it.

A note on the `plymouth-set-default-theme` helper script: on Ubuntu 25.10 it doesn't ship with the base `plymouth` package. If you try to run it and get "command not found," install `plymouth-themes` to get it back, or just use the `update-alternatives` + `update-initramfs` approach above — that's exactly what the script does internally.

## Lessons for next upgrade

A few things worth knowing for the next time you do a release upgrade:

- **Watch for the `dpkg` config-file prompt** during the upgrade (`*** grub (Y/I/N/O/D/Z) ***`). For files you've customized, pick "keep your currently-installed version" (`N`, the default), or take the new version and re-merge your changes manually.
- **Save a copy of `/etc/default/grub`** before you upgrade. If something does get reset, you can `diff` against the old one and restore the bits you care about.
- **Don't assume Plymouth is broken** when the splash looks bad. Nine times out of ten the real problem is the framebuffer GRUB is handing it, not Plymouth itself.

Boot splashes are short-lived, but they're also the first thing you see when you sit down at your machine. Worth getting right.
