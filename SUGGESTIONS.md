# Code Review Suggestions

- **Database path resilience**: The SQLite database points to `data/parts.db`, but the `data` directory may not exist on a fresh deployment, causing startup errors. Consider creating the directory during startup (e.g., `os.makedirs("data", exist_ok=True)`) before initializing the engine in `lifespan`.
- **Bulk add logic**: The `/add/bulk` handler currently nests two loops over `part_number`, redefining `safe_str` on each pass and only adds the last constructed `Part` per outer loop. Flattening to a single loop that constructs and commits each `Part` once would prevent duplicated iteration and ensure every row is saved.
- **Usage logging consistency**: `use_one_part` appends a timestamped note while `/scan/remove_one` writes plain text. Standardizing note formatting (e.g., always timestamping) would make history entries easier to read and audit.
- **Input validation**: Several forms accept raw strings for price and quantity. Adding server-side validation (e.g., clamping negatives, defaulting empty strings to `None`) can prevent invalid records and database errors.
- **Query efficiency**: The `/search` endpoint loads all parts into memory and filters in Python. Using SQL `ILIKE` filters similar to `/find` would offload work to the database and scale better for large datasets.
- **Error handling for missing parts**: Some routes assume `part` exists (e.g., `/scan/result` and `/scan/remove_one`). Returning 404 or user feedback when a part is missing can avoid silent failures and confusing redirects.
