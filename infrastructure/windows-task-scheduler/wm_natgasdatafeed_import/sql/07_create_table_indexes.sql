
CREATE NONCLUSTERED INDEX ix_nominations_gas_day
ON natgas.nominations (gas_day ASC);
GO

CREATE NONCLUSTERED INDEX ix_location_role_location_id
ON natgas.location_role (location_id);
GO

CREATE NONCLUSTERED INDEX ix_no_notice_gas_day
ON natgas.no_notice (gas_day);
GO
