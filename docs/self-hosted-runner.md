# Self-hosted runner (Israel)

Some chain portals block non-Israeli IPs (see `m0-reachability.md`). Those chains are fetched by
`.github/workflows/fetch-israel.yml` on a self-hosted runner with the label `israel`, currently the
home PC (Windows 11, Python 3.13 via the `py` launcher). Everything else runs on GitHub-hosted runners.

`pipeline.yml` never waits for this runner: it uses the newest `raw-israel` artifact if it is less
than 48 h old, otherwise those chains are reported as missing in `meta.json`.

## Security

The repo is public. A self-hosted runner executes whatever workflow code targets it, so:

- Only `fetch-israel.yml` uses `runs-on: [self-hosted, israel]`, and it is triggered only by
  `schedule` and `workflow_dispatch` (never `pull_request*` / `issue_comment`), with
  `if: github.repository == 'alon24g/salzol'`.
- Repo setting: *Actions → Fork pull request workflows → Require approval for all external
  contributors* (`approval_policy=all_external_contributors`).
- Review any PR that touches `.github/workflows/` before merging.

## Current install (2026-10-13)

- Runner 2.338.0 in `C:\Users\USER\actions-runner-salzol`, name `salzol-home-pc`, labels
  `self-hosted, Windows, X64, israel`. Downloaded from the official release; SHA-256 verified.
- Started with `run.cmd` (a minimized console window). It stops when that window is closed, on
  logoff or on reboot.

### Keep it running across reboots (pick one)

1. **Windows service** (recommended; needs an *administrator* PowerShell):
   ```powershell
   cd C:\Users\USER\actions-runner-salzol
   .\config.cmd remove --token (gh api -X POST repos/alon24g/salzol/actions/runners/remove-token --jq .token)
   .\config.cmd --unattended --url https://github.com/alon24g/salzol `
     --token (gh api -X POST repos/alon24g/salzol/actions/runners/registration-token --jq .token) `
     --name salzol-home-pc --labels israel --work _work --runasservice
   ```
2. **Start at logon** (no admin): put a shortcut to `C:\Users\USER\actions-runner-salzol\run.cmd`
   in `shell:startup` (Win+R → `shell:startup`).

## Moving it to another machine (e.g. a Raspberry Pi / mini PC)

On Linux the scraper runs as-is (no `fcntl` shim needed). Register the new runner with the same
label `israel`, and change the two `shell: powershell` steps in `fetch-israel.yml` to:

```yaml
      - name: Python env
        run: |
          python3 -m venv .venv
          .venv/bin/python -m pip install -q -r requirements.txt
      - name: Fetch
        run: .venv/bin/python -m pipeline.fetch --out raw-il --chains "$ISRAEL_CHAINS" --kinds stores,price_full
```

Then remove the old runner: `gh api -X DELETE repos/alon24g/salzol/actions/runners/<id>`.

## Removing it

```powershell
cd C:\Users\USER\actions-runner-salzol
.\config.cmd remove --token (gh api -X POST repos/alon24g/salzol/actions/runners/remove-token --jq .token)
```
then delete the folder.
