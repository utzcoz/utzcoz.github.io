---
layout: post
title:  "Generate AOSP make build system products graph"
date:   2020-03-11 17:23 +0800
---

The `AOSP` build system provides a make target called `product-graph` to generate products graph files. 

We can use below command to generate products graph files, `products.dot`, `products.svg`, `products.pdf` in `out/` directory.

```
make product-graph
```

This is a sample generated sample:

![generated-aosp-make-build-system-products-graph](/images/generate-aosp-make-build-system-products-graph.png "generated AOSP make build system products graph")
