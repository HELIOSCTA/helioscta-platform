with account_lookup(account_name, account, source, source_label) as (
    values

        -- ACIM
        ('ACIM', 'UBE 10051', 'nav', 'NAV Position File'),
        ('ACIM', '51014112.0', 'nav', 'NAV Position File'),
        ('ACIM', '51014112', 'nav', 'NAV Position File'),
        -- IOAGR ... EFD, 365
        ('ACIM', 'EFD', 'clear_street', 'Clear Street Trades'),
        ('ACIM', '365', 'clear_street', 'Clear Street Trades'),

        -- PNT
        ('PNT', 'ABN AMRO_1251PT034', 'nav', 'NAV Position File'),
        -- IOPNT ... FCR,  690
        ('PNT', 'FCR', 'clear_street', 'Clear Street Trades'),
        ('PNT', '690', 'clear_street', 'Clear Street Trades'),

        -- DICKSON
        ('DICKSON', 'RJO_35511229', 'nav', 'NAV Position File'),
        -- IOMOR ... RJO, 685
        ('DICKSON', 'RJO', 'clear_street', 'Clear Street Trades'),
        ('DICKSON', '685', 'clear_street', 'Clear Street Trades'),

        -- TITAN
        ('TITAN', '969 ESKHL', 'nav', 'NAV Position File'),
        -- ITITA ... ADU, 905
        ('TITAN', 'ADU', 'clear_street', 'Clear Street Trades'),
        ('TITAN', '905', 'clear_street', 'Clear Street Trades')
)

select * from account_lookup
