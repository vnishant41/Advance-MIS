import sys
import os

sys.path.insert(0, os.path.abspath('.'))

from app import create_app, db
from sqlalchemy import inspect, text

app = create_app()

with app.app_context():
    insp = inspect(db.engine)
    db_tables = set(insp.get_table_names())

    model_classes = []
    for attr_name in dir(sys.modules['app.models']):
        attr = getattr(sys.modules['app.models'], attr_name)
        if isinstance(attr, type) and issubclass(attr, db.Model) and attr is not db.Model:
            if hasattr(attr, '__tablename__'):
                model_classes.append(attr)

    model_tables = {cls.__tablename__: cls for cls in model_classes}

    print("=" * 80)
    print("DETAILED COLUMN & CONSTRAINT CHECK")
    print("=" * 80)

    # Let's inspect kanban_tasks and task_templates
    for t in ['kanban_tasks', 'task_templates', 'task_remarks', 'db_task_catalog', 'users', 'reports']:
        cols = insp.get_columns(t)
        print(f"\nColumns of `{t}`:")
        for c in cols:
            print(f"  - {c['name']}: {c['type']}, nullable={c['nullable']}, default={c['default']}")

    print("\n" + "=" * 80)
    print("ORPHAN RECORD CHECKS (BASED ON ACTUAL FOREIGN KEYS)")
    print("=" * 80)
    
    with db.engine.connect() as conn:
        for tbl in sorted(db_tables):
            fks = insp.get_foreign_keys(tbl)
            for fk in fks:
                col = fk['constrained_columns'][0]
                ref_tbl = fk['referred_table']
                ref_col = fk['referred_columns'][0]
                q = text(f"""
                    SELECT COUNT(*) FROM `{tbl}` c
                    LEFT JOIN `{ref_tbl}` p ON c.`{col}` = p.`{ref_col}`
                    WHERE c.`{col}` IS NOT NULL AND p.`{ref_col}` IS NULL
                """)
                orphans = conn.execute(q).scalar()
                if orphans > 0:
                    print(f"[ORPHAN] `{tbl}`.`{col}` -> `{ref_tbl}`.`{ref_col}`: {orphans} orphans!")
                else:
                    print(f"[OK] `{tbl}`.`{col}` -> `{ref_tbl}`.`{ref_col}`: 0 orphans")

        # Logical relationships that may lack DB-level foreign key constraints:
        print("\nChecking logical relationships without DB-level foreign key constraints:")
        logical_links = [
            ("db_task_catalog", "user_name", "users", "name"),
            ("reports", "primary_assignee", "users", "name"),
            ("backup_activations", "primary_user_id", "users", "id"),
            ("backup_activations", "backup_user_id", "users", "id"),
            ("roster_schedules", "user_id", "users", "id"),
            ("chat_messages", "sender_id", "users", "id"),
            ("notifications", "user_id", "users", "id"),
            ("task_remarks", "user_name", "users", "name"),
            ("kanban_tasks", "assignee_id", "users", "id"),
        ]

        for tbl, col, ref_tbl, ref_col in logical_links:
            # check if col exists in tbl
            tbl_cols = {c['name'] for c in insp.get_columns(tbl)}
            ref_cols = {c['name'] for c in insp.get_columns(ref_tbl)}
            if col in tbl_cols and ref_col in ref_cols:
                q = text(f"""
                    SELECT COUNT(*) FROM `{tbl}` c
                    LEFT JOIN `{ref_tbl}` p ON c.`{col}` = p.`{ref_col}`
                    WHERE c.`{col}` IS NOT NULL AND c.`{col}` != '' AND p.`{ref_col}` IS NULL
                """)
                cnt = conn.execute(q).scalar()
                if cnt > 0:
                    # Let's see some sample unlinked values
                    sample_q = text(f"""
                        SELECT DISTINCT c.`{col}` FROM `{tbl}` c
                        LEFT JOIN `{ref_tbl}` p ON c.`{col}` = p.`{ref_col}`
                        WHERE c.`{col}` IS NOT NULL AND c.`{col}` != '' AND p.`{ref_col}` IS NULL
                        LIMIT 5
                    """)
                    samples = [r[0] for r in conn.execute(sample_q).fetchall()]
                    print(f"[LOGICAL UNMATCHED] `{tbl}`.`{col}` -> `{ref_tbl}`.`{ref_col}`: {cnt} records with non-matching values! Samples: {samples}")
                else:
                    print(f"[OK] `{tbl}`.`{col}` -> `{ref_tbl}`.`{ref_col}`: 0 unmatched")
            else:
                print(f"[SKIPPED] `{tbl}`.`{col}` or `{ref_tbl}`.`{ref_col}` does not exist")
