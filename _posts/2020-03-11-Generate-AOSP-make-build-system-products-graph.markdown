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

In latest master(2022.11), I found that `product-graph` doesn't generate `products.pdf` and `products.svg` directly by calling `dot` command for us. And it prints hint commands to generate `products.pdf` and `products.svg` from generated `products.dot`:

```
Command to convert to pdf: dot -Tpdf -Nshape=box -o out/products.pdf out/products.dot
Command to convert to svg: dot -Tsvg -Nshape=box -o out/products.svg out/products.dot
```

And we can run previous commands to generate `products.pdf` and/or `products.svg` if need.