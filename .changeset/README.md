# Changesets

Run `pnpm changeset` to describe a user-visible package change in English.
Use a patch for fixes and compatible additions before 1.0, and a minor for breaking changes.
Select each directly changed package; dependent workspace versions are updated automatically.

The release workflow opens or updates a version PR on main. Merging that PR publishes
unpublished package versions through npm Trusted Publishing.

See [the release guide](../docs/releasing.md) for initial package registration and trust setup.
