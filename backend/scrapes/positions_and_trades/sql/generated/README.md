# Generated Position And Trade SQL

This directory contains standalone Postgres SQL generated from the packaged
position and trade product rule Python catalogues under `../../rules/data/`.

Regenerate after changing rules:

```powershell
python -m backend.scrapes.positions_and_trades.sql.generator
```

Generated artifacts:

- `clear_street_trades/mufg/latest.sql` reads raw
  `clear_street.eod_transactions`, applies the Clear Street product rules
  inline, filters to the latest SFTP trade date and MUFG firm numbers, and
  returns the CSV-shaped extract columns.
- `clear_street_trades/mufg/all_history.sql` uses the same extract shape and
  MUFG firm filter as `latest.sql`, but returns all loaded SFTP trade dates.
- `nav_positions/latest.sql` reads raw `nav.positions`, applies the NAV product
  rules inline, keeps each fund's latest available NAV date and latest SFTP
  upload, and returns raw NAV columns followed by generated rule fields.
- `nav_positions/all_history.sql` uses the same row-level extract shape as
  `latest.sql`, but includes every loaded NAV row.

The Clear Street file is also the packaged runtime input for the Clear Street
to MUFG upload workflow. All files remain read-only: they do not create,
update, or persist database objects.
