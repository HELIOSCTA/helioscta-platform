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
- `nav_positions/` contains read-only NAV grouped marts, checks, and drilldowns
  over raw `nav.positions`. These SQL files derive product code, product
  family, market, contract, option, strike, and rule-status fields at query
  time instead of persisting them to the NAV source table.

The Clear Street file is also the packaged runtime input for the Clear Street
to MUFG upload workflow. All files remain read-only: they do not create,
update, or persist database objects.
