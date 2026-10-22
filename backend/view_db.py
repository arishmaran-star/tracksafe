"""
TrackSafe Database Viewer Utility
Quickly inspect tables and rows in your live Supabase cloud database.
Usage:
    python view_db.py             # View overview of all tables and row counts
    python view_db.py defects     # View all rows in 'defects'
    python view_db.py blocks      # View all rows in 'maintenance_blocks'
    python view_db.py trains      # View all rows in 'train_movements'
    python view_db.py employees   # View all users and credentials
"""

import sys
import database

def print_table(title, rows):
    print(f"\n{'='*70}")
    print(f" {title.upper()} ({len(rows)} records)")
    print(f"{'='*70}")
    if not rows:
        print("  (Empty table - 0 rows)")
        return

    # Print rows
    for idx, r in enumerate(rows, 1):
        print(f"[{idx}] " + " | ".join(f"{k}: {v}" for k, v in r.items()))

def main():
    conn = database.get_db_connection()
    cur = conn.cursor()

    arg = sys.argv[1].lower() if len(sys.argv) > 1 else None

    alias_map = {
        "blocks": "maintenance_blocks",
        "trains": "train_movements",
        "dept": "departments",
        "depts": "departments"
    }
    target = alias_map.get(arg, arg)

    if not target:
        # Overview: print row counts for all tables
        print("\n" + "="*50)
        print(" SUPABASE LIVE DATABASE: TABLE OVERVIEW")
        print("="*50)
        tables = [
            "stations", "sections", "tracks", "departments",
            "employees", "assets", "trains", "train_movements",
            "defects", "maintenance_blocks", "block_tasks"
        ]
        for t in tables:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            count = cur.fetchone()['count']
            print(f"  • {t:<22} : {count} row(s)")
        print("\nTip: Run 'python view_db.py <table_name>' to view table contents.")
        print("Example: python view_db.py defects")
        print("="*50 + "\n")
    else:
        try:
            cur.execute(f"SELECT * FROM {target};")
            rows = cur.fetchall()
            print_table(target, rows)
        except Exception as e:
            print(f"Error viewing table '{target}': {e}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
