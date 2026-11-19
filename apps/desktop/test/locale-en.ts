// Desktop diagnostics are localized (Chinese first). These suites assert the
// English copy, so pin the locale before the modules under test are imported.
// Import this module first in the affected test files.
process.env.JULING_HARNESS_LOCALE = "en";
