---
layout: post
title: "Slack snap runs but never shows its window on KDE Plasma Wayland"
date: 2026-10-15 00:00 +0800
tags: [linux, snap, wayland, kde, electron, mesa, ai-assist]
---

I clicked "Open in Slack" on the sign-in page in my browser, and Slack never showed up. It was running, though. The tray icon was there and it was connected. Starting it again from the menu did nothing, and clicking the tray icon did nothing either.

This was on Ubuntu 26.04 with KDE Plasma 6.6 on Wayland and an AMD GPU (the in-kernel `amdgpu` driver plus Mesa). Slack was the snap, version 4.52.178 (revision 263). That's Electron 44 / Chromium 152, built on `core24` with the `gnome-46-2404` runtime.

The snap points the EGL loader at a Mesa that isn't there, so hardware GL fails and Chromium falls back to software compositing. In that mode, on Wayland, Slack's main window doesn't send a frame to the compositor, so KWin doesn't map it. Pointing the loaders at the Mesa the Slack snap already bundles fixes it. If you just want Slack back, skip to [the fix](#the-fix).

## Is there a window at all?

On Wayland, `wmctrl` and `xwininfo` can't see native windows, but KWin can tell you what it manages. This little KWin script prints every window it knows about:

```bash
cat > /tmp/list-windows.js <<'EOF'
var ws = workspace.windowList();
for (var i = 0; i < ws.length; i++) {
  print("WIN pid=" + ws[i].pid + " class=" + ws[i].resourceClass +
        " minimized=" + ws[i].minimized);
}
EOF
id=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript /tmp/list-windows.js listwin)
qdbus6 org.kde.KWin /Scripting/Script$id org.kde.kwin.Script.run
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript listwin
journalctl --user --since "-10s" -o cat | grep WIN
```

There was no `slack` window in the list, not even a hidden or minimized one. Slack's own log, which goes to the user journal when you start it from the desktop, disagreed:

```
info: Store: WINDOW_CREATED
info: Store: MAIN_WINDOW_SHOWN
...
info: Store: FOCUS_WINDOW
```

Electron thought the window was on screen. Every relaunch and every tray click got forwarded to the running instance as `FOCUS_WINDOW`, but KWin had no window to focus.

## The GPU process gives up

Further up, the same journal had this (I've removed the PIDs and timestamps):

```
MESA-LOADER: failed to open dri: /usr/lib/x86_64-linux-gnu/gbm/dri_gbm.so: cannot open shared object file: No such file or directory
ERROR:ui/gl/angle_platform_impl.cc:48] Display.cpp:1115 (initialize): ANGLE Display::initialize error 12289: Failed to get system egl display
ERROR:ui/gl/gl_display.cc:665] Initialization of all (2) EGL display types failed.
ERROR:ui/ozone/common/gl_ozone_egl.cc:26] GLDisplayEGL::Initialize failed.
ERROR:components/viz/service/main/viz_main_impl.cc:190] Exiting GPU process due to errors during initialization
```

Chromium retries the GPU process a few times and then restarts it with `--use-gl=disabled`. Slack logs `SET_HW_ACCEL_AVAILABILITY disabled_software`, and from then on everything is drawn on the CPU.

EGL fails because of the environment the snap sets in `/snap/slack/current/meta/snap.yaml`:

```yaml
LIBGL_DRIVERS_PATH: $SNAP/gnome-platform/usr/lib/x86_64-linux-gnu/dri
__EGL_VENDOR_LIBRARY_DIRS: $SNAP/gnome-platform/usr/share/glvnd/egl_vendor.d
```

`$SNAP/gnome-platform` is where the `gnome-46-2404` content snap gets mounted, and neither directory exists in it:

```bash
ls /snap/gnome-46-2404/current/usr/share/glvnd/egl_vendor.d
# ls: cannot access ...: No such file or directory

ls /snap/slack/current/usr/share/glvnd/egl_vendor.d
# 50_mesa.json

ls /snap/slack/current/usr/lib/x86_64-linux-gnu/gbm
# dri_gbm.so

grep -E 'gpu-2404|mesa-2404' /snap/slack/current/meta/snap.yaml
# (nothing)
```

The `gnome-46-2404` runtime doesn't ship Mesa. Snaps on `core24` normally get it from the `mesa-2404` snap through the `gpu-2404` interface, and the Slack snap doesn't plug that. It bundles its own Mesa 25.2.8 instead (`libEGL_mesa`, `libgallium`, `libgbm` and the GBM backend), but the two variables above still point into the GNOME runtime. I'd guess they date from when the GNOME runtime snaps carried Mesa themselves. The [Snapcraft RFC on moving them to `gpu-2404`](https://forum.snapcraft.io/t/rfc-migrating-gnome-and-kde-snapcraft-extensions-to-gpu-2404-userspace-interface/39718) describes that change. With the vendor directory missing, glvnd finds no EGL vendor and ANGLE reports "Failed to get system egl display".

GBM breaks separately. `libgbm` looks for its backend in its compiled-in path, `/usr/lib/x86_64-linux-gnu/gbm`. Inside the snap's mount namespace that's `core24`'s `/usr/lib`. It has no `gbm/` directory, and the snap has no layout to redirect it. That's the `MESA-LOADER` line.

The snap's launcher script (`bin/electron-launch`) also passes `--ozone-platform=wayland` whenever it finds the Wayland socket, which means Slack talks to KWin directly and not through XWayland.

## Comparing with a fresh profile

Software rendering is slower, but it should still put a window on screen. To check, I started a second Slack with a throwaway profile. Slack allows one running instance per profile, and `--user-data-dir` gets around that without touching your real one:

```bash
snap run slack --user-data-dir=/tmp/slack-test
```

That instance fell back to software rendering as well, and its sign-in window came up fine. Next I captured the Wayland traffic for both with `WAYLAND_DEBUG=client`.

The fresh profile, which works:

```
-> xdg_surface#57.get_toplevel(new id xdg_toplevel#58)
-> xdg_toplevel#58.set_app_id("slack")
-> wl_surface#34.commit()
   xdg_toplevel#58.configure(0, 0, array[0])
-> xdg_surface#57.set_window_geometry(...)    <- window resized during startup
-> xdg_surface#57.ack_configure(...)
-> wl_surface#34.attach(wl_buffer#54, 0, 0)
-> wl_surface#34.damage(...)
-> wl_surface#34.commit()
   ... and a steady stream of attach/commit after that
```

My signed-in profile, which doesn't:

```
-> xdg_surface#57.get_toplevel(new id xdg_toplevel#58)
-> xdg_toplevel#58.set_app_id("slack")
-> wl_surface#34.commit()
   xdg_toplevel#58.configure(0, 0, array[0])
-> xdg_surface#57.ack_configure(...)
-> wl_surface#34.commit()
   ... and then nothing for that surface, ever
```

In xdg-shell, a toplevel only gets mapped after the client acks the first configure and commits a buffer. Slack acks and then commits with no buffer attached. It had already allocated a software-rendered buffer for the window and never used it, and no other frame came after that. KWin leaves the window unmapped, and Electron goes on thinking it's showing.

The only difference I can see between the traces is the resize. The fresh sign-in window changes size before it acks the first configure, and a frame comes right after. The signed-in window opens at its saved size, so nothing changes at that point. My guess is that's what decides it, but I haven't dug through Chromium's Wayland frame code to prove it. I did check that with working hardware GL, the same signed-in profile shows its window right away.

These traces aren't safe to share as they are. `WAYLAND_DEBUG` prints window titles, and Slack puts workspace and channel names in them. Slack's own log lines include workspace and channel IDs too. Filter before you save or share anything:

```bash
WAYLAND_DEBUG=client snap run slack 2>&1 \
  | grep -E 'get_toplevel|ack_configure|wl_surface#[0-9]+\.(attach|commit)\('
```

## The fix

You can't override `__EGL_VENDOR_LIBRARY_DIRS` from outside, because the snap sets it itself. It leaves two other variables alone. glvnd reads `__EGL_VENDOR_LIBRARY_FILENAMES` before `__EGL_VENDOR_LIBRARY_DIRS`, and `GBM_BACKENDS_PATH` tells `libgbm` where `dri_gbm.so` is. Point both at the Mesa inside the Slack snap. `/snap/slack/current/...` resolves inside the snap's namespace and survives snap refreshes.

Try it by hand first. Quit the invisible Slack and start it with the two variables:

```bash
pkill -x slack

env __EGL_VENDOR_LIBRARY_FILENAMES=/snap/slack/current/usr/share/glvnd/egl_vendor.d/50_mesa.json \
    GBM_BACKENDS_PATH=/snap/slack/current/usr/lib/x86_64-linux-gnu/gbm \
    snap run slack
```

The window should show up, this time with hardware acceleration.

To make it permanent, put a copy of snapd's desktop file with the same name in `~/.local/share/applications`, which wins over `/var/lib/snapd/desktop/applications`. The menu, KRunner and `slack://` links from the browser all go through `slack_slack.desktop`, so they all pick it up:

```bash
mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/slack_slack.desktop <<'EOF'
[Desktop Entry]
X-SnapInstanceName=slack
Name=Slack
StartupWMClass=Slack
Comment=Slack Desktop
GenericName=Slack Client for Linux
X-SnapAppName=slack
Exec=env __EGL_VENDOR_LIBRARY_FILENAMES=/snap/slack/current/usr/share/glvnd/egl_vendor.d/50_mesa.json GBM_BACKENDS_PATH=/snap/slack/current/usr/lib/x86_64-linux-gnu/gbm /snap/bin/slack %U
Icon=/snap/slack/current/usr/share/pixmaps/slack.png
Type=Application
StartupNotify=true
Categories=GNOME;GTK;Network;InstantMessaging;
MimeType=x-scheme-handler/slack;
EOF
kbuildsycoca6
```

Then start Slack from the menu and check Slack's log and the libraries its GPU process loaded:

```bash
journalctl --user --since "-2min" -o cat | grep -E 'SET_HW_ACCEL_AVAILABILITY|GLDisplayEGL::Initialize failed'
# want: "SET_HW_ACCEL_AVAILABILITY enabled" and no GLDisplayEGL failures

for p in $(pgrep -x slack); do
  grep -qa -- '--type=gpu-process' /proc/$p/cmdline &&
    grep -oE 'lib(EGL_mesa|gallium)[^ ]*' /proc/$p/maps | sort -u
done
# want: libEGL_mesa.so.0... and libgallium-25.x...
```

Some caveats:

- I haven't looked at how Slack's own "launch on login" option starts the app under snap. If you want Slack at login, turn that option off and copy the override into `~/.config/autostart/` instead, so the login start uses the same `Exec` line.
- `snap revert` won't help. The previous revision has the same environment.
- Delete the override once the Slack snap fixes this. If a later revision moves its bundled Mesa, the variables will point at nothing and you're back to the original bug, but no worse off.

## What the snap should do

If you maintain the Slack snap, either of these fixes it properly:

- Plug `gpu-2404` and use the `mesa-2404` content snap, like other `core24` GUI snaps. The [Snapcraft GPU extension](https://ubuntu.com/docs/snapcraft/stable/reference/extensions/gpu-extension/) sets that up for you.
- Keep the bundled Mesa and point the environment at it: `__EGL_VENDOR_LIBRARY_DIRS: $SNAP/usr/share/glvnd/egl_vendor.d` and `GBM_BACKENDS_PATH: $SNAP/usr/lib/x86_64-linux-gnu/gbm`. The `LIBGL_DRIVERS_PATH` line can go.

Don't mix this up with the tray icon bug in the same Slack and Electron versions on Plasma 6. That one comes from snapd's AppArmor rules rejecting Chromium's new StatusNotifierItem D-Bus names ([snapcraft forum thread](https://forum.snapcraft.io/t/slack-snap-4-51-180-revision-254-loses-kde-plasma-tray-icon/52466)). My tray icon registered and worked. With a working tray icon and no window, look at the GPU errors instead.

## Summary

If the Slack snap is running on a Wayland session but no window appears:

1. Run `journalctl --user -b | grep -E 'GLDisplayEGL::Initialize failed|dri_gbm'`. Either line showing up means you probably have this bug.
2. Quit Slack and start it with `__EGL_VENDOR_LIBRARY_FILENAMES` and `GBM_BACKENDS_PATH` pointing into `/snap/slack/current`.
3. If the window appears, put the same `Exec` line in `~/.local/share/applications/slack_slack.desktop`.

What threw me was that Slack never looked broken from the inside. It logged the window as shown and happily took every tray click and relaunch. I didn't believe the window was missing until KWin said so. Next time a Wayland app "opens" and nothing appears, I'm asking the compositor first.
