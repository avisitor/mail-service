#!/usr/bin/env python3
"""
Export templates and maillog data from retreehawaii MySQL database to JSON files
for import into the mail-service Prisma database.
"""

import mysql.connector
import json
import sys
from datetime import datetime

# Database connection config
DB_CONFIG = {
    'host': 'localhost',
    'user': 'laana',
    'password': '0$o7Z&93',
    'database': 'retreehawaii',
    'charset': 'utf8mb4'
}

def export_templates():
    """Export all templates from retreehawaii database."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM templates ORDER BY id")
        templates = cursor.fetchall()
        
        # Convert datetime objects to strings
        for template in templates:
            if template['created']:
                template['created'] = template['created'].isoformat()
        
        with open('retreehawaii_templates.json', 'w', encoding='utf-8') as f:
            json.dump(templates, f, indent=2, ensure_ascii=False)
        
        print(f"Exported {len(templates)} templates to retreehawaii_templates.json")
        
        cursor.close()
        conn.close()
        return templates
        
    except Exception as e:
        print(f"Error exporting templates: {e}")
        return []

def export_maillog(limit=1000):
    """Export recent maillog entries from retreehawaii database."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute(f"SELECT * FROM maillog ORDER BY sent DESC LIMIT {limit}")
        maillog = cursor.fetchall()
        
        # Convert datetime objects to strings
        for entry in maillog:
            if entry['sent']:
                entry['sent'] = entry['sent'].isoformat()
            if entry['opened']:
                entry['opened'] = entry['opened'].isoformat()
        
        with open('retreehawaii_maillog.json', 'w', encoding='utf-8') as f:
            json.dump(maillog, f, indent=2, ensure_ascii=False)
        
        print(f"Exported {len(maillog)} maillog entries to retreehawaii_maillog.json")
        
        cursor.close()
        conn.close()
        return maillog
        
    except Exception as e:
        print(f"Error exporting maillog: {e}")
        return []

if __name__ == "__main__":
    print("Exporting data from retreehawaii database...")
    templates = export_templates()
    maillog = export_maillog()
    
    print(f"\nSummary:")
    print(f"Templates: {len(templates)}")
    print(f"Maillog entries: {len(maillog)}")