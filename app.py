from flask import Flask, render_template
import sqlite3


def get_db_connection():
    connection = sqlite3.connect('database.db')
    connection.row_factory = sqlite3.Row
    return connection

app = Flask(__name__)

@app.route('/')
def index():
    connection = get_db_connection()
    users = connection.execute('SELECT * FROM Users').fetchall()
    connection.close()
    return render_template('index.html', users=users)
@app.route('/about.html')
def about():
    return render_template('about.html')

@app.route('/register.html')
def register():

    return render_template('register.html')
@app.route('/signin.html')
def signin():

    return render_template('signin.html')