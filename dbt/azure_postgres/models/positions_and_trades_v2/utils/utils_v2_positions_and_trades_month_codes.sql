with month_codes(month_number, month_name, month_code) as (
    values
        (1, 'Jan', 'F'),
        (2, 'Feb', 'G'),
        (3, 'Mar', 'H'),
        (4, 'Apr', 'J'),
        (5, 'May', 'K'),
        (6, 'Jun', 'M'),
        (7, 'Jul', 'N'),
        (8, 'Aug', 'Q'),
        (9, 'Sep', 'U'),
        (10, 'Oct', 'V'),
        (11, 'Nov', 'X'),
        (12, 'Dec', 'Z')
)

select * from month_codes
