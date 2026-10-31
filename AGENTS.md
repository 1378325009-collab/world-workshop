# Release examples

- Public packages must use one of the existing public templates in `模板/` as their initial showcase. The selected template is recorded in `release-example.json`.
- Never embed a user's private world, character material, chat history, generated images, or API settings as release examples. Use the application's own icon for the assistant avatar.
- Generate `default-world.js` with `scripts/prepare-release-example.mjs` before packaging. Web, Android, and desktop builders must include the same generated example.
- Keep existing on-device archives and settings when updating. Legacy storage identifiers and the Android application ID are compatibility identifiers; do not rename them merely to change the public example.
- Release notes and screenshots must use public template content. Preserve local backups outside the repository before removing private source material.
