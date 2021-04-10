---
layout: post
title:  "Analyze Android ContextMenu"
date:   2020-03-24 22:15 +0800
---

## Code base

`AOSP` 9.0

## How to use `ContextMenu`

The common use of `ContextMenu` is override the `Activity`'s `onCreateContextMenu`

```Java
@Override
public void onCreateContextMenu(ContextMenu menu, View v, ContextMenu.ContextMenuInfo menuInfo) {
    super.onCreateContextMenu(menu, v, menuInfo);
    menu.setHeaderTitle("Context Menu");
    menu.add(....); 
}
```

And then use `registerForContextMenu` to register the `ContextMenu` for specific view. After that, when the user long clicks this specific view, system will show the `ContextMenu` with the items added by the logic in `onCreateContextMenu`. And then, we override the `Activity`'s `onContextItemSelected` to response the item selected event.

```Java
@Override
public boolean onContextItemSelected(MenuItem item) {
  // Response to the item selected event.
}
```

It's easy to use. So let's analyze how all that things work.

## `Activity.registerForContextMenu`

```Java
public void registerForContextMenu(View view) {
    view.setOnCreateContextMenuListener(this);
}
```

`Activity`'s `registerForContextMenu` is very simple, and it invokes the `View`'s `setOnCreateContextMenuListener` with the `Activity`. The `OnCreateContextMenuListener` has only one method, called `onCreateContextMenu`, the method we override before in `Activity`. It looks like the `View` will invoke `Activity`'s `onCreateContextMenu` sometime to create `ContextMenu`.

## `View.createContextMenu`

```
public void createContextMenu(ContextMenu menu) {
    ContextMenuInfo menuInfo = getContextMenuInfo();

    // Sets the current menu info so all items added to menu will have
    // my extra info set.
    ((MenuBuilder)menu).setCurrentMenuInfo(menuInfo);

    onCreateContextMenu(menu);
    ListenerInfo li = mListenerInfo;
    if (li != null && li.mOnCreateContextMenuListener != null) {
        li.mOnCreateContextMenuListener.onCreateContextMenu(menu, this, menuInfo);
    }

    // Clear the extra information so subsequent items that aren't mine don't
    // have my extra info.
    ((MenuBuilder)menu).setCurrentMenuInfo(null);

    if (mParent != null) {
        mParent.createContextMenu(menu);
    }
}
```

View's `createContextMenu` is simple too, and it will invoke its `onCreateContextMenu` and then `mOnCreateContextMenuListener`'s `onCreateContextMenu`, that we set before in `Activity`. 

Now, we know if we use `Activity`'s methods, and implement logic to add `MenuItem` to `ContextMenu`, the system will invoke it to inflate and show `ContextMenu`. So who does that?

## `View.performLongClickInternal`

From the `View.performLongClickInternal`, we can see following code snippet:

```Java
if (li != null && li.mOnLongClickListener != null) {
    handled = li.mOnLongClickListener.onLongClick(View.this);
}
if (!handled) {
    final boolean isAnchored = !Float.isNaN(x) && !Float.isNaN(y);
    handled = isAnchored ? showContextMenu(x, y) : showContextMenu();
}
```

If the `View`'s `OnLongClickListener` consumes the long click event, there will not have `ContextMenu`, otherwise the `View` will try to use `showContextMenu` to show the `ContextMenu`.

The `View.showContextMenuView` is simple too:

```Java
public boolean showContextMenu(float x, float y) {
    return getParent().showContextMenuForChild(this, x, y);
}
```

It will invoke parent's `showContextMenuForChild` to show `ContextMenu`. This is a invoking chain. Although some system `View` and `ViewGroup` instances override this method, but they keep the invoking chain. So who is the top parent?

## `PhoneWindow.setContentView`

When `Activity` initializing, we will use `setContentView` to set the content view layout:

```Java
public void setContentView(@LayoutRes int layoutResID) {
    getWindow().setContentView(layoutResID);
    initWindowDecorActionBar();
}
```

It will invoke the `PhoneWindow`'s `setContentView` to set the content view to window. And `PhoneWindow.setContentView` will invoke `PhoneWindow.installDecor` to initialize the `DecorView` with content view. The `DecorView` is the parent of entire `Activity` content view. And `Activity` add `DecorView` to a window in its `makeVisible` method:

```Java
void makeVisible() {
    if (!mWindowAdded) {
        ViewManager wm = getWindowManager();
        wm.addView(mDecor, getWindow().getAttributes());
        mWindowAdded = true;
    }
    mDecor.setVisibility(View.VISIBLE);
}
```

And this method invoking chain will add `ViewRootImpl` as `DecorView` parent. So the `ViewRootImpl`'s the final parent of the `View`s.

But the `ViewRootImpl.showContextMenuForChild` returns false default, so it doesn't do the showing work. If we looks into the `DecorView`'s `showContextViewMenuForChild`, we will find it does the work, and doesn't use parent to pass it to upper hierachy.

## `DecorView.showContextMenuForChildInternal`

From the `DecorView`'s `showContextmenuForChildInternal`, we can show the following code snippet:

```Java
final PhoneWindowMenuCallback callback = mWindow.mContextMenuCallback;
if (mWindow.mContextMenu == null) {
    mWindow.mContextMenu = new ContextMenuBuilder(getContext());
    mWindow.mContextMenu.setCallback(callback);
} else {
    mWindow.mContextMenu.clearAll();
}

final MenuHelper helper;
final boolean isPopup = !Float.isNaN(x) && !Float.isNaN(y);
if (isPopup) {
    helper = mWindow.mContextMenu.showPopup(getContext(), originalView, x, y);
} else {
    helper = mWindow.mContextMenu.showDialog(originalView, originalView.getWindowToken());
}
```

It will invoke `mWindow.mConextMenu`'s `showPopup` or `showDialog` to show `ContextMenu`. The `mWindow` is the `PhoneWindow` `Activity` attached. The `mContextMenu` is an instance of `ContextMenuBuilder`. So we will look into its `showPopup` method as example.

## `ContextMenuBuilder.showPopup`

```Java
public MenuPopupHelper showPopup(Context context, View originalView, float x, float y) {
    if (originalView != null) {
        // Let relevant views and their populate context listeners populate
        // the context menu
        originalView.createContextMenu(this);
    }

    if (getVisibleItems().size() > 0) {
        EventLog.writeEvent(50001, 1);

        int location[] = new int[2];
        originalView.getLocationOnScreen(location);

        final MenuPopupHelper helper = new MenuPopupHelper(
                    context,
                    this,
                    originalView,
                    false /* overflowOnly */,
                    com.android.internal.R.attr.contextPopupMenuStyle);
        helper.show(Math.round(x), Math.round(y));
        return helper;
    }

    return null;
}
```

The `showPopup` will invoke `originView`'s `createContextMenu` to create the `ContextMenu`, what we introduce above, and the `originView` is the reference of the view that occurs long click event. Now the invoke chain is completeness. After creating `ContextMenu`, it will use `MenuPopupHelper` to show popup window relative to the `originView`. The popup window for the menu is `MenuPopupWindow`.

## `MenuPoup.onItemClick`

The `MenuPopup` set its as the `MenuPopupWindow`'s `OnItemClickListener`, and use `onItemClick` method to receive the menu item clicked event.

```Java
@Override
public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
    ListAdapter outerAdapter = (ListAdapter) parent.getAdapter();
    MenuAdapter wrappedAdapter = toMenuAdapter(outerAdapter);

    // Use the position from the outer adapter so that if a header view was added, we don't get
    // an off-by-1 error in position.
    wrappedAdapter.mAdapterMenu.performItemAction((MenuItem) outerAdapter.getItem(position), 0);
}
```

The `performItemAction` in `MenuBuilder` will dispatch item click to `Activity` by a long invoking chain, and `Activity` will call the `onContextMenuItemSelected` method. The `MenuBuilder` in this occasion is the `ContextMenuBuilder` we introduce before. The `MenuBuilder` will use its `Callback` instance to dispatch the item clicked event, which is set by `DecorView` in its `showContextMenuForChildInternal` with the value `mWindow.mContextMenucallback`. Every `Activity` has a `PhoneWindow`, and its `PhoneWindow` instance will dispatch item clicked event to it when menu item clicked.

Now, when to show `ContextMenu` and how to pass menu item clicked event analyzing is finished.

## How to use `ContextMenu` without `Activity`

But what if we want to use `ContextMenu` without `Activity`?

If we use `WindowManager.addWindow` to add our layout directly, the system will not initialize `DecorView` to it, and add `ViewRootImpl` as layout parent directly. So there is a parent to do the real showing work. If we want to make it work again, we should create a `ContextMenuBuilder` for layout, and invoke its `showPopup` or `showDialog` method to show `ContextMenu` by simulating logic of `DecorView`.






