import sqlite3

connection = sqlite3.connect('database.db')

with open('schema.sql') as f:
    connection.executescript(f.read())

cursor = connection.cursor()

cursor.execute("INSERT INTO Users(fname, lname, email) VALUES ('Mason', 'Krause', 'masongkrause@yahoo.com')")
cursor.execute("INSERT INTO Users (fname, lname, email) VALUES('Tommy', 'Jones', 'tj@gmail.com')")

connection.commit()
connection.close()