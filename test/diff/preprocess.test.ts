import { describe, expect, it } from "vitest";

import { parseUnifiedDiff, preprocessDiff } from "../../src/diff/preprocess.js";

const MESSY_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,4 @@
 export function run() {
-  return 1;
+  const base = 1;
+  const boost = 2;
+  return base + boost;
 }
diff --git a/assets/logo-old.png b/assets/logo-new.png
similarity index 100%
rename from assets/logo-old.png
rename to assets/logo-new.png
Binary files a/assets/logo-old.png and b/assets/logo-new.png differ
`;

const DELETE_DIFF = `diff --git a/src/obsolete.ts b/src/obsolete.ts
deleted file mode 100644
index ccccccc..0000000
--- a/src/obsolete.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const obsolete = true;
-export const stale = true;
`;

describe("parseUnifiedDiff", () => {
  it("parses messy multi-file diffs with rename and binary markers", () => {
    const files = parseUnifiedDiff(MESSY_DIFF);

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/app.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].additions).toBe(3);
    expect(files[0].deletions).toBe(1);

    expect(files[1].path).toBe("assets/logo-new.png");
    expect(files[1].oldPath).toBe("assets/logo-old.png");
    expect(files[1].isBinary).toBe(true);
    expect(files[1].hunks).toHaveLength(0);
    expect(files[1].patchText.startsWith("diff --git")).toBe(true);
  });

  it("falls back to old path when a file is deleted", () => {
    const files = parseUnifiedDiff(DELETE_DIFF);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/obsolete.ts");
    expect(files[0].oldPath).toBe("src/obsolete.ts");
    expect(files[0].deletions).toBe(2);
    expect(files[0].additions).toBe(0);
  });
});

describe("preprocessDiff", () => {
  it("attaches deterministic noise assessment while preserving structure", () => {
    const files = preprocessDiff(MESSY_DIFF);

    expect(files).toHaveLength(2);
    expect(files[0].noise.isNoise).toBe(false);
    expect(files[0].hunks[0]?.header).toContain("@@");
    expect(files[1].noise.isNoise).toBe(true);
    expect(files[1].noise.reason).toBe("binary");
  });
});
