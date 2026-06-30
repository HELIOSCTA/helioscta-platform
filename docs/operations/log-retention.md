# Log Retention

HeliosCTA production jobs write process output to journald and, when
`HELIOS_LOG_DIR=/var/log/helioscta` is configured, script file logs under
`/var/log/helioscta`.

## Policy

- journald persistent logs: keep up to `30day`, capped at `1G`.
- journald runtime logs: cap at `256M`.
- `/var/log/helioscta`: retain failure logs for operator review.
- Successful scrape file logs are deleted by default by scripts that initialize
  logging with `delete_if_no_errors=True`.

The versioned journald drop-in is:

```text
infrastructure/systemd/journald-helioscta.conf
```

Install it on the VM as:

```bash
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo cp /opt/helioscta-platform/infrastructure/systemd/journald-helioscta.conf /etc/systemd/journald.conf.d/helioscta.conf
sudo systemctl restart systemd-journald
```

## Inspection Commands

Use these from the production VM:

```bash
journalctl --disk-usage
journalctl -u helios-pjm-da-hrl-lmps.service -n 100 --no-pager
journalctl -u helios-pjm-rt-fivemin-hrl-lmps.service -n 200 --no-pager
journalctl -u helios-pjm-data-miner-batch.service -n 200 --no-pager
journalctl -u helios-pjm-ops-sum.service -n 200 --no-pager
journalctl -u helios-prod-health-check.service -n 120 --no-pager
sudo find /var/log/helioscta -type f -mtime +30 -print
```

Manual cleanup, if disk pressure requires it:

```bash
sudo journalctl --vacuum-time=30d
sudo find /var/log/helioscta -type f -mtime +30 -delete
```

Do not print `/etc/helioscta/backend.env` while inspecting logs. It contains
production credentials.
