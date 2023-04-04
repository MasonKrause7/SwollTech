import sqlite3

connection = sqlite3.connect('database.db')

with open('schema.sql') as f:
    connection.executescript(f.read())

cursor = connection.cursor()

cursor.execute("INSERT INTO Users(fname, lname, email, dob, password) VALUES ('Mason', 'Krause', 'masongkrause@yahoo.com', '1995/03/20', '123password')")
cursor.execute("INSERT INTO Users (fname, lname, email, dob, password) VALUES('Crissy', 'Roseanna', 'crissyrkrause@gmail.com', '1985/06/18', 'password123')")

connection.commit()
connection.close()