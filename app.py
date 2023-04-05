from flask import Flask, render_template, request, session, redirect, url_for, flash
import sqlite3


DATABASE = 'database.db'
app = Flask('SwollTech')
def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db





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
    password = request.form['pass']
    confPassword = request.form['confpass']
    if(password != confPassword):
        message = "Password and confirmation do not match, please try again"
        return render_template(url_for('login'), message=message)
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']

    successfulInsert = False
    db = get_db()
    cursor = db.cursor()
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = cursor.execute(query)
    users = results.fetchall()
    if len(users) > 0: #if user already exists, render login
        user = users[0]
        message = "That email is already associated with an account, please log in"
        return render_template('login.html', user=user, message=message)
    else:
        message = ""
        try:
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ('{fname}', '{lname}', '{email}', '{dob}', '{password}')"
            cursor.execute(query)
            db.commit()
            print("record added successfully")
            message = "Sign up successful. Please log in to your new account"
            successfulInsert = True
        except:
            db.rollback()
            message = "There was an error during the sign up process. Please try again."
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

            return render_template(url_for('login'), user=user, message=message)

@app.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html', user=user, message=message)
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        userExists = False
        connection = get_db()
        cursor = connection.cursor()
        query = f"SELECT * FROM Users WHERE email= '{username}'"
        results = cursor.execute(query)
        if results is None:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message)
        else:
            users = results.fetchall()
            user = users[0]
            passwordInDb = user['password']
            if passwordInDb == password:
                session['user_id']=user['user_id']
                session['email']=user['email']
                session['fname']=user['fname']
                session['lname']=user['lname']
                return render_template(url_for('home'))
            else:
                message = "Sorry, that password is incorrect."
                return render_template(url_for('login'), user=user, message=message)

@app.route('/home.html')
def home():
    if session['user_id'] is None:
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message)
    #query relevant homepage data

    return render_template('home.html')

@app.get('/createworkout.html')
def createworkout():
    if 'username' in session:
        return render_template('createworkout.html')
    else:
        return redirect(url_for('login.html'))
@app.post('/createworkout/<workout_name>')
def submitworkoutname(workout_name1):
    connection = get_db()
    cursor = connection.cursor()
    cursor.execute('INSERT INTO Workout (workout_name) VALUES (workout_name1)')



