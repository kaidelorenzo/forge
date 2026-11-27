---
'@tylertech/forge': patch
---

fix(table): the filter row and fixed header styles apply to the table's own header only, so a table nested in an expanded row keeps its header divider, height and position when the outer table shows its filters
