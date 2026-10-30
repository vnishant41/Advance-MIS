import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, base_dir)

from app import create_app, db
from sqlalchemy import inspect, text

app = create_app()

with app.app_context():
    inspector = inspect(db.engine)
    tables = sorted(inspector.get_table_names())
    print(f"TOTAL TABLES IN MYSQL advance_erp: {len(tables)}")
    with db.engine.connect() as conn:
        for t in tables:
            try:
                cnt = conn.execute(text(f"SELECT COUNT(*) FROM `{t}`")).scalar()
                cols = len(inspector.get_columns(t))
                print(f"Table: {t:<30} Columns: {cols:<4} Rows: {cnt}")
            except Exception as e:
                print(f"Table: {t:<30} Error: {e}")
