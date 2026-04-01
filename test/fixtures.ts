export const SIMPLE_APP_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,7 @@
 export function run() {
-  return 1;
+  const base = 1;
+  const boost = 2;
+  return base + boost;
 }
`;

export const LOCKFILE_DIFF = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 3333333..4444444 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,3 +1,3 @@
-lockfileVersion: 9.0
+lockfileVersion: 9.1
 packages: {}
`;

export const LARGE_HUNK_DIFF = `diff --git a/src/large.ts b/src/large.ts
index 5555555..6666666 100644
--- a/src/large.ts
+++ b/src/large.ts
@@ -1,2 +1,40 @@
 export const values = [
-1,2
+1,
+2,
+3,
+4,
+5,
+6,
+7,
+8,
+9,
+10,
+11,
+12,
+13,
+14,
+15,
+16,
+17,
+18,
+19,
+20,
+21,
+22,
+23,
+24,
+25,
+26,
+27,
+28,
+29,
+30,
+31,
+32,
+33,
+34,
+35,
+36,
+37,
+38,
+39,
+40,
 ];
`;
