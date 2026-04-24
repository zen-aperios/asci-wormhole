# asci-wormhole Usage (Webflow)

## 1) Add Assets

In `Project Settings -> Custom Code`:

Head:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/zen-aperios/asci-wormhole@main/asci-wormhole.min.css" />
```

Footer (before `</body>`):

```html
<script src="https://cdn.jsdelivr.net/gh/zen-aperios/asci-wormhole@main/asci-wormhole.min.js"></script>
```

## 2) Add Markup

Copy the required HTML structure from `index.html` into your Webflow Embed where needed.

## 3) Publish

Publish and hard refresh.

## 4) Pinned Version (Cache Safe)

After a release, pin by commit:

```html
<script src="https://cdn.jsdelivr.net/gh/zen-aperios/asci-wormhole@<commit>/asci-wormhole.min.js"></script>
```
