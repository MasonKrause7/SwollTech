import sqlite3

connection = sqlite3.connect('database.db')

with open('sql/schema.sql') as f:
    connection.executescript(f.read())
    connection.commit()
with open('sql/insert_test_data.sql') as i:
    connection.executescript(i.read())

connection.commit()
connection.close()