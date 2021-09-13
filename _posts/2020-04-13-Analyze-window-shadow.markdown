---
layout: post
title:  "Analyze window shadow"
date:   2020-04-13 16:31 +0800
---

> This article based on `AOSP` 9.0.

The Android uses Z value of view to calculate the view hierarchy, and shadow size of view. And the Z is the plus result of view's elevation and view's  translation Z. So if we change any of them, and the final Z value of view will change.

In frameworks, system uses elevation of view to change the Z value of value, and then effect its shadow size. The window shadow is actually the shadow of `DecorView`. When `DecorView` get the focus, that represents the window of `DecorView` attached get the focus, it will increase its elevation to get more shadow, and decrease the elevation to decrease the shadow size when it loses the focus.

When the view's elevation or translation Z value changed, it will set it to `RenderNode` in `hwui`. In `hwui`, if we select `OpenGLPipeline` as pipeline implementation, it will use elevation and translation Z to calculate the final Z value of view, and calculate the  spot shadow and ambient value shadow matrix/region.  And then it will use skia to draw the shadow on display. 

If we select `SkiaOpenGLPipeline` as pipeline implementation, it will use elevation and translation Z to calculate the final Z value of view, and fetch `RenderNode`'s ambient shadow color and spot shadow color, and then pass them to `SkShadowUtils(in skia)::DrawShadow` to draw the shadow. Also, it will use outline path to restrict the final shadow region.

## `DecorView`

```java
private void updateElevation() {
    float elevation = 0;
    final boolean wasAdjustedForStack = mElevationAdjustedForStack;
    // Do not use a shadow when we are in resizing mode (mBackdropFrameRenderer not null)
    // since the shadow is bound to the content size and not the target size.
    final int windowingMode =
            getResources().getConfiguration().windowConfiguration.getWindowingMode();
    if ((windowingMode == WINDOWING_MODE_FREEFORM) && !isResizing()) {
        elevation = hasWindowFocus() ?
                DECOR_SHADOW_FOCUSED_HEIGHT_IN_DIP : DECOR_SHADOW_UNFOCUSED_HEIGHT_IN_DIP;
        // Add a maximum shadow height value to the top level view.
        // Note that pinned stack doesn't have focus
        // so maximum shadow height adjustment isn't needed.
        // TODO(skuhne): Remove this if clause once b/22668382 got fixed.
        if (!mAllowUpdateElevation) {
            elevation = DECOR_SHADOW_FOCUSED_HEIGHT_IN_DIP;
        }
        // Convert the DP elevation into physical pixels.
        elevation = dipToPx(elevation);
        mElevationAdjustedForStack = true;
    } else if (windowingMode == WINDOWING_MODE_PINNED) {
        elevation = dipToPx(PINNED_WINDOWING_MODE_ELEVATION_IN_DIP);
        mElevationAdjustedForStack = true;
    } else {
        mElevationAdjustedForStack = false;
    }

    // Don't change the elevation if we didn't previously adjust it for the stack it was in
    // or it didn't change.
    if ((wasAdjustedForStack || mElevationAdjustedForStack)
            && getElevation() != elevation) {
        mWindow.setElevation(elevation);
    }
}
```

When `DecorView` important states are changed, it will invoke its `updateElevation` to update its elevation based on its current states. And it will invoke `View.setElevation(float)`:

```java
public void setElevation(float elevation) {
    if (elevation != getElevation()) {
        elevation = sanitizeFloatPropertyValue(elevation, "elevation");
        invalidateViewProperty(true, false);
        mRenderNode.setElevation(elevation);
        invalidateViewProperty(false, true);

        invalidateParentIfNeededAndWasQuickRejected();
    }
}
```

Every view has its `RenderNode`, and it will set the new elevation value to its `RenderNode` in `hwui`. And the value will set to `RenderProperties.cpp` in `hwui`, which stores the render node properties for `RenderNode`.

## Select pipeline implementation

There are many pipeline implementation, and different implementation has different logic to draw shadow. So before we look into the implementation, we should see how the system select the pipeline implementation.

In `CanvasContext.cpp`, there is a method called create, and it will use input parameter to create different pipeline implementation to the caller:

```c++
CanvasContext* CanvasContext::create(RenderThread& thread, bool translucent,
                                     RenderNode* rootRenderNode, IContextFactory* contextFactory) {
    auto renderType = Properties::getRenderPipelineType();

    switch (renderType) {
        case RenderPipelineType::OpenGL:
            return new CanvasContext(thread, translucent, rootRenderNode, contextFactory,
                                     std::make_unique<OpenGLPipeline>(thread));
        case RenderPipelineType::SkiaGL:
            return new CanvasContext(thread, translucent, rootRenderNode, contextFactory,
                                     std::make_unique<skiapipeline::SkiaOpenGLPipeline>(thread));
        case RenderPipelineType::SkiaVulkan:
            return new CanvasContext(thread, translucent, rootRenderNode, contextFactory,
                                     std::make_unique<skiapipeline::SkiaVulkanPipeline>(thread));
        default:
            LOG_ALWAYS_FATAL("canvas context type %d not supported", (int32_t)renderType);
            break;
    }
    return nullptr;

}
```

This method will use `Properties::getRenderPipelineType` to get the wanted pipeline type, and that method uses the specific property value to get the wanted pipeline type:

```c++
#define PROPERTY_RENDERER "debug.hwui.renderer"

RenderPipelineType Properties::getRenderPipelineType() {
    if (sRenderPipelineType != RenderPipelineType::NotInitialized) {
        return sRenderPipelineType;
    }
    char prop[PROPERTY_VALUE_MAX];
    property_get(PROPERTY_RENDERER, prop, "skiagl");
    if (!strcmp(prop, "skiagl")) {
        ALOGD("Skia GL Pipeline");
        sRenderPipelineType = RenderPipelineType::SkiaGL;
    } else if (!strcmp(prop, "skiavk")) {
        ALOGD("Skia Vulkan Pipeline");
        sRenderPipelineType = RenderPipelineType::SkiaVulkan;
    } else {  //"opengl"
        ALOGD("HWUI GL Pipeline");
        sRenderPipelineType = RenderPipelineType::OpenGL;
    }
    return sRenderPipelineType;
}
```

If we set the `debug.hwui.renderer` to `skiagl`, then it will use `SkialOpenGLPipeline`; if we set to `skiavk`, it will use `SkiaVulkanPipeline`; otherwise it will use `OpenGLPipeline`(in master branch, the `OpenGLPipeline` looks like it was removed). In my emulator, the default value of `opengl`, so it uses `OpenGLPipeline`.

## OpenGLPipeline

`OpenGLPipeline::draw`->`FrameBuilder::deferLayers`->`FrameBuilder::deferNodeOps`.

```c++
void FrameBuilder::deferNodeOps(const RenderNode& renderNode) {

    // other code
    // can't be null, since DL=null node rejection happens before deferNodePropsAndOps
    const DisplayList& displayList = *(renderNode.getDisplayList());
    for (auto& chunk : displayList.getChunks()) {
        FatVector<ZRenderNodeOpPair, 16> zTranslatedNodes;
        buildZSortedChildList(&zTranslatedNodes, displayList, chunk);

        defer3dChildren(chunk.reorderClip, ChildrenSelectMode::Negative, zTranslatedNodes);

        // other code
        defer3dChildren(chunk.reorderClip, ChildrenSelectMode::Positive, zTranslatedNodes);
    }
}

template <typename V>
static void buildZSortedChildList(V* zTranslatedNodes, const DisplayList& displayList,
                                  const DisplayList::Chunk& chunk) {
    if (chunk.beginChildIndex == chunk.endChildIndex) return;

    for (size_t i = chunk.beginChildIndex; i < chunk.endChildIndex; i++) {
        RenderNodeOp* childOp = displayList.getChildren()[i];
        RenderNode* child = childOp->renderNode;
        float childZ = child->properties().getZ();

        if (!MathUtils::isZero(childZ) && chunk.reorderChildren) {
            zTranslatedNodes->push_back(ZRenderNodeOpPair(childZ, childOp));
            childOp->skipInOrderDraw = true;
        } else if (!child->properties().getProjectBackwards()) {
            // regular, in order drawing DisplayList
            childOp->skipInOrderDraw = false;
        }
    }

    // Z sort any 3d children (stable-ness makes z compare fall back to standard drawing order)
    std::stable_sort(zTranslatedNodes->begin(), zTranslatedNodes->end());
}
```

It will invoke `buildZSortedChildList` to build child list based on z sorted list. The `ZRenderNodeOpPair` key is z value, and value is `RenderNodeOp`. And then it invokes `defer3dChildren`, that will invoke `deferShadow` to generate `ShadowOp`:

```c++
void FrameBuilder::deferShadow(const ClipBase* reorderClip, const RenderNodeOp& casterNodeOp) {
    // other code
    // apply reorder clip to shadow, so it respects clip at beginning of reorderable chunk
    int restoreTo = mCanvasState.save(SaveFlags::MatrixClip);
    mCanvasState.writableSnapshot()->applyClip(reorderClip,
                                               *mCanvasState.currentSnapshot()->transform);
    if (CC_LIKELY(!mCanvasState.getRenderTargetClipBounds().isEmpty())) {
        Matrix4 shadowMatrixXY(casterNodeOp.localMatrix);
        Matrix4 shadowMatrixZ(casterNodeOp.localMatrix);
        node.applyViewPropertyTransforms(shadowMatrixXY, false);
        node.applyViewPropertyTransforms(shadowMatrixZ, true);

        sp<TessellationCache::ShadowTask> task = mCaches.tessellationCache.getShadowTask(
                mCanvasState.currentTransform(), mCanvasState.getLocalClipBounds(),
                casterAlpha >= 1.0f, casterPath, &shadowMatrixXY, &shadowMatrixZ,
                mCanvasState.currentSnapshot()->getRelativeLightCenter(), mLightRadius);
        ShadowOp* shadowOp = mAllocator.create<ShadowOp>(task, casterAlpha);
        BakedOpState* bakedOpState = BakedOpState::tryShadowOpConstruct(
                mAllocator, *mCanvasState.writableSnapshot(), shadowOp);
        if (CC_LIKELY(bakedOpState)) {
            currentLayer().deferUnmergeableOp(mAllocator, bakedOpState, OpBatchType::Shadow);
        }
    }
    mCanvasState.restoreToCount(restoreTo);
}
```

It will use clip bounds to restrict shadow. And then it uses `TessellationCache::getShadowTask` to calculate spot shadow and ambient shadow matrix/region:

```c++
sp<TessellationCache::ShadowTask> TessellationCache::getShadowTask(
        const Matrix4* drawTransform, const Rect& localClip, bool opaque,
        const SkPath* casterPerimeter, const Matrix4* transformXY, const Matrix4* transformZ,
        const Vector3& lightCenter, float lightRadius) {
    ShadowDescription key(casterPerimeter, drawTransform);
    ShadowTask* task = static_cast<ShadowTask*>(mShadowCache.get(key));
    if (!task) {
        precacheShadows(drawTransform, localClip, opaque, casterPerimeter, transformXY, transformZ,
                        lightCenter, lightRadius);
        task = static_cast<ShadowTask*>(mShadowCache.get(key));
    }
    LOG_ALWAYS_FATAL_IF(task == nullptr, "shadow not precached");
    return task;
}
```

The invoking sequence is 
```
     ┌─────────────────┐          ┌──────────────────────────────────┐          ┌─────────────────┐                   
     │TessellationCache│          │TessellationCache::ShadowProcessor│          │ShadowTessellator│                   
     └────────┬────────┘          └────────────────┬─────────────────┘          └────────┬────────┘                   
              ────┐                                │                                     │                            
                  │ getShadowTask                  │                                     │                            
              <───┘                                │                                     │                            
              │                                    │                                     │                            
              │          precacheShadows           │                                     │                            
              │───────────────────────────────────>│                                     │                            
              │                                    │                                     │                            
              │             onProcess              │                                     │                            
              │<───────────────────────────────────│                                     │                            
              │                                    │                                     │                            
              │                            tessellateShadows                             │                            
              │─────────────────────────────────────────────────────────────────────────>│                            
              │                                    │                                     │                            
              │                                    │                                     ────┐                        
              │                                    │                                         │ tessellateAmbientShadow
              │                                    │                                     <───┘                        
              │                                    │                                     │                            
              │                                    │                                     │                            
              │<─────────────────────────────────────────────────────────────────────────│                            
              │                                    │                                     │                            
              │                            tessellateShadows                             │                            
              │─────────────────────────────────────────────────────────────────────────>│                            
              │                                    │                                     │                            
              │                                    │                                     ────┐                        
              │                                    │                                         │ tessellateSpotShadow   
              │                                    │                                     <───┘                        
              │                                    │                                     │                            
              │                                    │                                     │                            
              │<─────────────────────────────────────────────────────────────────────────│                            
     ┌────────┴────────┐          ┌────────────────┴─────────────────┐          ┌────────┴────────┐                   
     │TessellationCache│          │TessellationCache::ShadowProcessor│          │ShadowTessellator│                   
     └─────────────────┘          └──────────────────────────────────┘          └─────────────────┘                   
```

To here, the shadow matrix/region has been calculated based on Z value, and then the `OpenGLPipeline::draw` will invoke `FrameBuilder::<BakedOpDispatcher>replayBakedOps` to replay and merge all baked ops, also including `ShadowOp`. In `BakedOpDispatcher::onShadowOp`, it will invoke `BakedOpDispatcher::renderShadow` to render shadow:

```c++
static void renderShadow(BakedOpRenderer& renderer, const BakedOpState& state, float casterAlpha,
                         const VertexBuffer* ambientShadowVertexBuffer,
                         const VertexBuffer* spotShadowVertexBuffer) {
    SkPaint paint;
    paint.setAntiAlias(true);  // want to use AlphaVertex

    // The caller has made sure casterAlpha > 0.
    uint8_t ambientShadowAlpha = renderer.getLightInfo().ambientShadowAlpha;
    if (CC_UNLIKELY(Properties::overrideAmbientShadowStrength >= 0)) {
        ambientShadowAlpha = Properties::overrideAmbientShadowStrength;
    }
    if (ambientShadowVertexBuffer && ambientShadowAlpha > 0) {
        paint.setAlpha((uint8_t)(casterAlpha * ambientShadowAlpha));
        renderVertexBuffer(renderer, state, *ambientShadowVertexBuffer, 0, 0, paint,
                           VertexBufferRenderFlags::ShadowInterp);
    }

    uint8_t spotShadowAlpha = renderer.getLightInfo().spotShadowAlpha;
    if (CC_UNLIKELY(Properties::overrideSpotShadowStrength >= 0)) {
        spotShadowAlpha = Properties::overrideSpotShadowStrength;
    }
    if (spotShadowVertexBuffer && spotShadowAlpha > 0) {
        paint.setAlpha((uint8_t)(casterAlpha * spotShadowAlpha));
        renderVertexBuffer(renderer, state, *spotShadowVertexBuffer, 0, 0, paint,
                           VertexBufferRenderFlags::ShadowInterp);
    }
}
```

The `renderShadow` uses `SkPaint` to customize the shadow attribute. The default `SkPaint` fill color is black, so the shadow color is black. If we change the paint color in this method, we will see some rigid but funny result ![opengl-pipeline-shadow-after-modifying](/images/opengl-pipeline-shadow-after-modifying.png)

The above graph is the result after I set ambient color to green, and spot color to red. It affects the global, if we want to get more fine control, we should add method to pass the wanted shadow color of every render node to there.

## `SkiaOpenGLPipeline`

The `SkiaOpenGLPipeline` doesn't draw shadow in its draw operation, but it will draw shadow in `EndReorderBarrierDrawable`.

In `ThreadedRenderer`'s `updateRootDisplayList` method, we can see below code snippet:

```java
canvas.insertReorderBarrier();
canvas.drawRenderNode(view.updateDisplayListIfDirty());
canvas.insertInorderBarrier();
// other code
mRootNode.end(canvas);
```
 The `canvas` will insert reorder barrier before drawing the render node and insert inorder barrier after, and invoke `RenderNode.end` method will invoke `SkiaCanvas::drawDrawable` with the `EndReorderBarrierDrawable` instance as input parameter, which will invoke `EndReorderBarrierDrawable::onDraw`. The `EndReorderBarrierDrawable::onDraw` will invoke `EndReorderBarrierDrawable::drawShadow` to draw shadow. The `drawShadow` method will invoke `SkShadowUtils::DrawShadow` to help draw the shadow.

```c++
SkColor ambientColor = multiplyAlpha(casterProperties.getAmbientShadowColor(), ambientAlpha);
SkColor spotColor = multiplyAlpha(casterProperties.getSpotShadowColor(), spotAlpha);
SkShadowUtils::DrawShadow(
        canvas, *casterPath, zParams, skiaLightPos, SkiaPipeline::getLightRadius(),
        ambientColor, spotColor,
        casterAlpha < 1.0f ? SkShadowFlags::kTransparentOccluder_ShadowFlag : 0);
```

The following graph is the result that changed ambientColor to green, and spotColor blue.

![skia-opengl-pipeline-shadow-after-modifying](/images/skia-opengl-pipeline-shadow-after-modifying.png)

## Summary

The `OpenGLPipeline` and `SkiaOpenGLPipeline` use `OpenGL` to draw the shadow both, although they draw shadow in different stage. And they both use elevation and translation Z value of view to calculate the shadow bounds, and use clip bounds of view to restrict shadow bounds. `SkiaOpenGLPipeline` also uses ambient shadow color and spot shadow color of view to draw the shadow, so we can use `View.setOutlineAmbientShadowColor(@ColorInt int color)` and `View.setOutlineSpotShadowColor(@ColorInt int color)` to control the shadow color dynamically.