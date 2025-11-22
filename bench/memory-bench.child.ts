import "valibot";

const target = process.argv[2];
if (!target) throw new Error("No target specified");
if (!global.gc)
  throw new Error(
    "Garbage collection is not exposed. Run the script with `node --expose-gc`.",
  );

global.gc();
const before = process.memoryUsage();

const _ = await import(target);

global.gc();
const after = process.memoryUsage();

const diff = {
  rss: after.rss - before.rss,
  heapUsed: after.heapUsed - before.heapUsed,
  external: after.external - before.external,
};

console.log(JSON.stringify(diff));
