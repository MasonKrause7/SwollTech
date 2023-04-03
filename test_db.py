import sqlite3


conn = sqlite3.connect('database.db')
conn.row_factory=sqlite3.Row

exercise_types = conn.execute('SELECT * FROM Exercise_Type').fetchall()
for type in exercise_types:
    print(type['exercise_type_name'])
