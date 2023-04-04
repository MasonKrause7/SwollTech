from flask import Flask, render_template, request, session, redirect, url_for
import sqlite3
import usermodel

DATABASE = 'database.db'
app = Flask(__name__)
def get_db():
    db = sqlite3.connect(DATABASE)
    return db;




app.secret_key = 'testingkey,changelater'

@app.route('/')
def index():
    return render_template('index.html')
@app.route('/about.html')
def about():
    return render_template('about.html')

@app.get('/signup.html')
def get_signup():
    return render_template('signup.html')
@app.post('/signup.html')
def post_signup():
    #NEED TO VALIDATE REGISTRATION DATA
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']
    password = request.form['pass']
    confPassword = request.form['confpass']
    if(password != confPassword):
        return 'Password and confirmation do not match, please go back and try again'

    db = get_db()
    db.row_factory = sqlite3.Row
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = db.execute(query)
    users = results.fetchall()
    if len(users) > 0:
        user = users[0]
        return render_template('login.html', user=user)
    else:
        try:
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ({fname}, {lname}, {email}, {dob}, {password})"
            cursor = db.cursor()
            cursor.execute(query)
            db.commit()
            print("record added successfully")
            query = f"SELECT * FROM Users WHERE email='{email}'"
            user = db.execute(query)
            return render_template('login.html', user=user)
        except:
            db.rollback()
            print('error inserting record')
        finally:
            db.close()
            return render_template('login.html', user=None)




@app.route('/login.html', methods=['GET', 'POST'])
def signin():
    if request.method == 'GET':
        return render_template('login.html')
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        connection = get_db_connection()
        userExists = False
        query = f"SELECT * FROM Users WHERE email= {username}"


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



