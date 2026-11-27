---
'@tylertech/forge': patch
---

fix(table): expanding a row while it collapses opens its expanded row again instead of adding another, and collapsing a row whose expansion panel hasn't opened yet removes it, so toggling a row quickly no longer leaves duplicate or stuck expanded rows
