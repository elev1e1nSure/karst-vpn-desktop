Human-readable unpacked bundle

What changed:
- Removed the outer self-unpacking wrapper and base64 manifest.
- Decoded JS/JSX/font assets into normal files.
- Preserved the app markup, styles, logic, colors, layout, and behavior.
- The text that was pasted before <!DOCTYPE html> is saved at source/text-before-doctype.txt and is not inserted into HTML, because placing text before <!DOCTYPE html> can change browser rendering mode and visual output.

Files:
- index.html — readable multi-file version. Best opened through a local HTTP server.
- standalone-readable.html — single-file version with decoded inline JS and data-URI assets.
- assets/dc-runtime.js — decoded runtime.
- components/android-frame.jsx — decoded imported component.
- source/app-logic.js — extracted app logic from the inline Design Component script.
- source/x-dc-template.html — extracted visual template fragment.

To view index.html locally:
  cd human_readable_bundle
  npx http-server .

Then open the printed local URL.
