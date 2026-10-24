# Publishing packages

The seven packages are published independently from this repository with Changesets.
Normal releases use npm Trusted Publishing through `.github/workflows/release.yml`.
No npm token is stored in GitHub secrets.

## Initial registration

1. Log in to npm with an account that owns the `enlumine` package name and has permission to publish under `@enlumine`.
2. If necessary, create the free npm organization `enlumine` and grant the publishing account access.
3. Install dependencies, build, run `pnpm test`, `pnpm check`, and `pnpm smoke:packages`.
4. Review the initial package archives and commands:

   ```sh
   pnpm bootstrap:publish --dry-run
   ```

5. Register the actual `0.0.0` packages with the `bootstrap` tag:

   ```sh
   pnpm bootstrap:publish
   ```

   npm may require interactive two-factor authentication. The command publishes dependencies before dependents and skips versions already registered, so it can resume a partial registration. These versions contain the built library, not placeholder code. The `latest` tag is reserved for the first version published through the release workflow.

6. Configure the trusted publisher for every package:

   ```sh
   pnpm trust:configure --dry-run
   pnpm trust:configure
   ```

   This runs the pinned npm CLI with the following settings:

   | Field | Value |
   | --- | --- |
   | Provider | GitHub Actions |
   | GitHub owner | `toiroakr` |
   | Repository | `enlumine` |
   | Workflow filename | `release.yml` |
   | Environment | `release` |
   | Allowed operation | `npm publish` |

   If setup is interrupted, resume a remaining package with `pnpm trust:configure --package=@enlumine/sql`. The equivalent settings can be entered on npm's package settings page. Keep the environment name identical in GitHub and npm. A new trust configuration must complete a successful publish within two days; recreate an expired configuration before retrying.

7. Merge the initial version PR after all seven trust configurations exist. Its changeset advances every package to `0.1.0`. The main-branch release workflow builds and checks the packages before publishing them through OIDC with the `latest` tag.
8. Confirm all seven versions, dependency versions, and trusted publisher settings on npm. After a successful tokenless release, package settings can disallow token-based publishing while requiring two-factor authentication for manual operations.

## GitHub configuration

Create a GitHub environment named `release`, restricted to the `main` branch. Repository settings must allow GitHub Actions to create pull requests for the Changesets version PR.

The workflow can use the default `GITHUB_TOKEN`. To have generated version PRs trigger CI automatically, configure the release GitHub App with repository access, `APP_CLIENT_ID` as a repository variable, and `APP_PRIVATE_KEY` as a secret. The workflow uses that App only when the client ID is configured. Without the App, the default token's generated PR events do not trigger other workflows; release validation still runs before publishing.

Public repositories receive npm provenance. The workflow disables explicit provenance for private repositories, which can still use trusted publishing. Repository visibility is managed separately from npm package visibility.

The release workflow uses GitHub-hosted runners, Node 24, a pinned npm CLI, and `id-token: write`. Its repository and branch condition prevents release execution from forks or other branches. Concurrent releases are serialized and are not canceled midway through publication.

## Subsequent releases

1. Run `pnpm changeset` and describe the user-visible change in English.
2. Select directly changed packages. For versions below 1.0, use patch for compatible fixes and additions and minor for breaking changes.
3. Commit the changeset with the implementation.
4. The main-branch workflow maintains a `chore: release` version PR, including changelogs and lockfile changes.
5. Merge the version PR to publish the new versions. Use the manual Release workflow dispatch to retry a partial publish.

The workflow never accepts package versions or shell commands from workflow inputs. Build outputs and bootstrap archives remain in ignored directories.

References: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/), [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
