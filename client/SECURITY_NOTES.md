# Client dependency review — Phase 4

Checked on 2026-11-17. `npm audit --omit=dev` reports zero production dependency vulnerabilities. `npm audit` reports five high entries representing the same transitive picomatch ReDoS advisory through the development-only Vite/Vitest/fdir/tinyglobby toolchain.

- Advisory: [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
- The npm registry's latest picomatch release is 4.0.7, included in the affected range. The advisory states that there are no patched versions.
- The upstream master parser still limits one of the repeated-extglob checks to multiple branches: [official parser source](https://github.com/micromatch/picomatch/blob/master/lib/parse.js).
- The referenced [upstream pull request 194](https://github.com/micromatch/picomatch/pull/194) remains open and explicitly says it is not a security fix. No verified, merged upstream fix was found to vendor. We did not substitute an unreviewed patch or downgrade the toolchain to make the audit output disappear.

The application does not accept runtime glob patterns or import picomatch. These tools process trusted, checked-in build/test configuration and source paths. Do not pass user-controlled patterns to build/test tooling or expose the test runner to untrusted callers. The test API is disabled; production serves compiled static assets, not the Vitest server. Recheck the advisory and update the lockfile when an official fix is available.

Vitest 5.1.0 replaces the initially evaluated Vitest 3 toolchain and removes its critical tinypool and earlier mocker advisories. This test configuration requires Node >=22.12 and Vite >=6.4; the lockfile satisfies these versions. No `npm audit fix --force` was used.
