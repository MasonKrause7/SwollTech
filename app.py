from flask import Flask, render_template, request, session, redirect, url_for
import sqlite3
import usermodel

def get_db_connection():
    connection = sqlite3.connect('database.db')
    connection.row_factory = sqlite3.Row
    return connection

app = Flask(__name__)

app.secret_key = 'testingkey,changelater'

@app.route('/')
def index():
    connection = get_db_connection()
    users = connection.execute('SELECT * FROM Users').fetchall()
    connection.close()
    return render_template('index.html', users=users)
@app.route('/about.html')
def about():
    return render_template('about.html')

@app.get('/signup')
def register():
    return render_template('signup.html')
@app.post('/signup')
def register():
    #NEED TO VALIDATE REGISTRATION DATA
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']
    password = request.form['pass']
    confPassword = request.form['confPassword']
    if(password != confPassword):
        return 'The password and confirmation did not match, please try again'

    connection = get_db_connection()
    query = f"SELECT * FROM Users WHERE email = '{email}'"
    users = connection.execute(query)
    if len(users) > 0:
        return render_template(url_for('login.html'))
    else:
        query = f"INSERT INTO "


@app.route('/login.html', methods=['GET', 'POST'])
def signin():
    if request.method == 'GET':
        return render_template('login.html')
    else:
        session['username'] = request.form['username']
        return redirect(url_for('home.html'))

@app.get('/createworkout.html')
def createworkout():
    if 'username' in session:
        return render_template('createworkout.html')
    else:
        return redirect(url_for('login.html'))
@app.post('/createworkout/<workout_name>')
def submitworkoutname(workout_name1):
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute('INSERT INTO Workout (workout_name) VALUES (workout_name1)')



