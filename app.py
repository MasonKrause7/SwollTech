from flask import Flask, render_template, request, session, redirect, url_for
import sqlite3
import usermodel

DATABASE = 'database.db'
app = Flask(__name__)
def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
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

    successfulInsert = False
    db = get_db()
    cursor = db.cursor()
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = cursor.execute(query)
    users = results.fetchall()
    if len(users) > 0: #if user already exists, render login
        user = users[0]
        return render_template('login.html', user=user)
    else:
        try:
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ('{fname}', '{lname}', '{email}', '{dob}', '{password}')"
            cursor.execute(query)
            db.commit()
            print("record added successfully")
            successfulInsert = True
        except:
            db.rollback()
            print('error inserting record')
        finally:
            user = None
            if successfulInsert:
                query = f"SELECT * FROM Users WHERE email = '{email}'"
                results = cursor.execute(query)
                result = results.fetchall()
                user = result[0]
                db.close()

            else:
                db.close()
            return render_template(url_for('login'), user=user)





@app.route('/login.html', methods=['GET', 'POST'])
def login(user=None):
    if request.method == 'GET':
        return render_template('login.html', user=user)
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        userExists = False
        connection = get_db()
        cursor = connection.cursor()
        query = f"SELECT * FROM Users WHERE email= '{username}'"
        results = cursor.execute(query)
        if results is None:
            return "No user exists with that email, please go back and try again"
        else:
            users = results.fetchall()
            user = users[0]
            passwordInDb = user['password']
            if passwordInDb == password:
                #perform login
                print('passwords match')


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



