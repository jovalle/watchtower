# Favicons

A favicon (short for "favorite icon") is a small icon associated with a particular website or web page.

It is typically displayed in the browser's address bar, tab, bookmark list, and other places where the website is referenced.

## Generating Favicons

```bash
magick apple-touch-icon.png -trim -gravity center -resize 16x16 favicon-16x16.png
magick apple-touch-icon.png -trim -gravity center -resize 32x32 favicon-32x32.png
magick apple-touch-icon.png -trim -gravity center -resize 48x48 favicon-48x48.png
magick favicon-16x16.png favicon-32x32.png favicon-48x48.png favicon.ico
```
