// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/. The `web` and `jmap` boundary
// stays in ESLint's no-restricted-imports.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    // A warning for now (2026-11-11): the composer's store, session, compose and registry modules import
    // each other. When they are split so the imports run one way, this goes and the rule is an error again.
    { name: "no-circular", severity: "warn" },
  ],
};
