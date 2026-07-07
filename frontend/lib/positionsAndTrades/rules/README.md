# Product Rules

These JSON files are the product-rule source of truth.

- `product_definitions.json`: product-code metadata such as family, market, underlying code, Bloomberg code, and default exchange.
- `product_aliases.json`: raw source product descriptions mapped to product codes.

After editing either file, regenerate and verify NAV position SQL:

```powershell
cd frontend
python scripts\verify-nav-position-sql.py
```

TypeScript imports these files through `productLookup.ts`. Python imports the
same files through `scripts/generate-nav-position-sql.py`.
