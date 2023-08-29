from flask import Flask, escape, render_template, request, session, redirect, url_for
from passlib.hash import pbkdf2_sha256
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import numpy as np
import json
import plotly
from plotly import utils
import plotly.express as px
import os

db = SQLAlchemy()

application = Flask(__name__)
uri = f"mysql://{'root'}:{'SoccerPlayer7!'}@{'localhost'}:3306/{'swolltech'}"
application.config['SQLALCHEMY_DATABASE_URI'] = uri
application.config['SECRET_KEY'] = "testing key"

db.init_app(application)

class Users(db.Model):

    user_id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), unique=False, nullable=False)
    lname = db.Column(db.String(80), unique=False, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    dob = db.Column(db.DateTime, unique=False, nullable=False)
    passowrd = db.Column(db.String(200), unique=False, nullable=False)

class Workout(db.Model):
    workout_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_name = db.Column(db.String(100), unique=False, nullable=False)
    deleted = db.Column(db.Boolean)

class Sesh(db.Model):
    sesh_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    date_of_sesh = db.Column(db.DateTime, nullable=False)
class Exercise_Type(db.Model):
    exercise_type_id = db.Column(db.Integer, primary_key=True)
    exercise_type_name = db.Column(db.String(25))
class Exercise(db.Model):
    exercise_id = db.Column(db.Integer, primary_key=True)
    exercise_name = db.Column(db.String(80), nullable=False)
    exercise_type_id = db.Column(db.Integer, db.ForeignKey(Exercise_Type.exercise_type_id))
class Workout_Exercise(db.Model):
    wo_ex_id = db.Column(db.Integer, primary_key=True )
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    exercise_id = db.Column(db.Integer, db.ForeignKey(Exercise.exercise_id))

class Cardio_Set(db.Model):
    c_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    duration_amount = db.Column(db.Double)
    duration_metric = db.Column(db.String(50))
    distance_amount = db.Column(db.Double)
    distance_metric = db.Column(db.String(50))
class Strength_Set(db.Model):
    s_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    number_of_reps = db.Column(db.Integer)
    weight_amount = db.Column(db.Double)
    weight_metric = db.Column(db.String(25))

@application.route('/')
def index():
    if user_authenticated():
        return redirect(url_for('home'))
    return render_template('index.html')


@application.route('/about.html')
def about():
    return render_template('about.html')


@application.get('/signup.html')
def get_signup():
    return render_template('signup.html')


@application.post('/signup.html')
def post_signup():
    # NEED TO VALIDATE REGISTRATION DATA
    #collecting form data
    fname = request.form['fname']
    lname = request.form['lname']
    email = request.form['email']
    dob = request.form['dob']
    password = request.form['pass']
    confPassword = request.form['confpass']
    if (password != confPassword):
        message = "Password and confirmation do not match, please try again"
        return render_template(url_for('get_signup'), message=message, messageCategory='danger', fname=fname, lname=lname, email=email, dob=dob, password=password)
    #check if user exists in db
    successfulInsert = False
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"SELECT * FROM Users WHERE email='{email}'"
    results = cursor.execute(query)
    users = results.fetchall()
    if len(users) > 0:  # if user already exists, render login
        user = users[0]
        message = "That email is already associated with an account, please log in instead"
        return render_template('login.html', message=message, messageCategory='danger')
    else: #valid new user, try adding to db
        message = ""
        try:
            hashword = pbkdf2_sha256.hash(password)
            query = f"INSERT INTO Users (fname, lname, email, dob, password) VALUES ('{fname}', '{lname}', '{email}', '{dob}', '{hashword}')"
            cursor.execute(query)
            cnxn.commit()
            print("record added successfully")
            message = "Sign up successful. Please log in to your new account"
            cnxn.close()
            return render_template(url_for('login'), message=message, messageCategory='success')

        except:
            cnxn.rollback()
            message = "There was an error during the sign up process. Please try again."
            print('error inserting record')
            cnxn.close()
            return render_template(url_for('get_signup'), message=message, messageCategory='danger')


@application.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html')
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')
        userExists = False
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT * FROM Users WHERE email= '{username}'"
        results = cursor.execute(query)
        result = results.fetchall()
        cnxn.close()
        if len(result) == 0:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message, messageCategory='danger')
        else:
            user = result[0]
            if pbkdf2_sha256.verify(password, user[5]):
                session['logged_in'] = True
                session['user_id'] = user[0]
                session['email'] = user[3]
                session['fname'] = user[1]
                session['lname'] = user[2]
                return redirect(url_for('home'))
            else:
                message = "Sorry, that password is incorrect."
                return render_template(url_for('login'), message=message, messageCategory='danger')


@application.route('/logout')
def logout():
    if len(session.keys()) == 0:
        message = 'You were not logged in'
        return render_template('index.html', message=message, messageCategory='danger')
    session.clear()

    message = 'Successfully signed out'
    return render_template('index.html', message=message, messageCategory='success')


@application.route('/account.html')
def account():
    if user_authenticated():
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/account.html/')
def edit_account():
    if user_authenticated():
        action = request.args.get('action')
        if action == 'change_email':
            return render_template('changeemail.html')
        elif action == 'change_password':
            return render_template('changepassword.html')
        elif action == 'delete_account':
            return render_template('deleteaccount.html')
        return render_template('account.html')
    else:
        message = 'You must be logged in to view your account. Please log in or register for a free account.'
        return render_template('index.html', message=message, messageCategory='danger')
@application.post('/change_email/')
def change_email():
    if user_authenticated():
        new_email = request.form.get('new_email')
        print(new_email)
        password = request.form.get('password')
        print(password)
        cnxn = get_db()
        crsr = cnxn.cursor()
        query = f'SELECT password FROM Users WHERE user_id={session["user_id"]}'
        result = crsr.execute(query).fetchall()
        existing_password = result[0][0]
        cnxn.close()
        if password:
            if pbkdf2_sha256.verify(password, existing_password):
                print('passwords verified, updating user email')
                update_user_email(new_email)
                session['email'] = new_email
                return render_template('account.html', message='Email updated', messageCategory='success')
            else:
                message = 'That password is incorrect, please check your entry and try again.'
                return render_template('changeemail.html', message=message, messageCategory='danger')
        else:
            print('password could not be selected')
            return render_template('changeemail.html', message='Something went wrong, password could not be selected', messageCategory = 'danger')
    else:
        message = 'You are not logged in. Please log in or create an account.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.post('/change_password/')
def change_password():
    if user_authenticated():
        curr_password = request.form['curr_password']
        new_password = request.form['new_password']
        conf = request.form['conf_new_password']
        cnxn = get_db()
        crsr = cnxn.cursor()
        query = f'SELECT password FROM Users WHERE user_id={session["user_id"]}'
        result = crsr.execute(query).fetchall()
        existing_password = result[0][0]
        cnxn.close()
        if pbkdf2_sha256.verify(curr_password, existing_password):
            if new_password == conf:
                update_user_password(new_password)
                return render_template('account.html', message='Password updated', messageCategory='success')
            else:
                return render_template('changepassword.html', message='Your new password did not match the password confirmation. Please double check your password and try again.', messageCategory='danger')
        else:
            message = 'That password is incorrect, please check your entry and try again.'
            return render_template('changepassword.html', message=message, messageCategory='danger')

    else:
        message = 'You are not logged in. Please log in or create an account'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/deleteaccount/')
def delete_account():
    if user_authenticated():
        user_id = request.args.get('user_id')
        delete_user_account(user_id)
        session.clear()
        message = 'Your account has been deleted. Hope to see you back soon!'
        return render_template('index.html', message=message, messageCategory='success')
    else:
        message = 'You are not logged in to an account. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/home.html/')
def home(message=None):
    if not user_authenticated():
        message = 'You must be logged in to access your home page'
        return render_template(url_for('login'), message=message)

    # TESTING plotly
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_onerepmax_data {session['user_id']};"
    results = cursor.execute(query).fetchall()
    if results is None or len(results) == 0:
        return render_template('home.html')
    #made up test data
    #data = {'Bench': [135, 155, 175], 'Squat':[155, 175, 185], 'Deadlift': [200, 225, 255]}
    data = [[]]
    maxData={}

    #building real data set
    for result in results:
        l = []
        if result.weight_metric == 'kg':
            weight_kgs = result.weight_amount
            weight_lbs = float(weight_kgs) * 2.20462262
            result.weight_metric = 'lbs'
            result.weight_amount = weight_lbs
        #Epleys formula for calulating one rep max
        onerepmax = float(result.weight_amount) * (1 + float(result.number_of_reps)/30)
        l.append(result.exercise_name)
        l.append(onerepmax)
        data.append(l)
        #data[i] = ['Bench', 225.68749]
    data.pop(0) #removes empty list
    for i in range(0, len(data)):
        if data[i][0] in maxData.keys():
            currMax = maxData.get(data[i][0])
            if currMax < data[i][1]:
                maxData.update({data[i][0] : data[i][1]})
        else:
            maxData.update({data[i][0] : data[i][1]})
    data = []
    indexs = []
    for key in maxData.keys():
        indexs.append(key)
        data.append([key, maxData.get(key)])



    df = pd.DataFrame(data, columns=["Exercise", "Weight"], index=indexs)

    print(df)

    fig = px.bar(df, x="Exercise", y="Weight", title="Best 1 Rep Max", barmode='group')
    graphJSON = json.dumps(fig, cls=plotly.utils.PlotlyJSONEncoder)

    return render_template('home.html', graphJSON=graphJSON)

@application.route('/viewworkout.html')
def view_workouts():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('viewworkout.html', users_workouts=users_workouts)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/viewworkout.html/')
def view_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        workout_id = request.args.get('workout_id')
        workout_name = request.args.get('workout_name')
        unfilt_exercises = get_exercises_by_workout(workout_id)
        exercises = []
        for ex in unfilt_exercises:
            if ex.deleted is None or ex.deleted == 0:
                exercises.append(ex)

        strength_sets = fetch_last_workout_strength_sets(workout_id)
        for set in strength_sets:
            datetime = str(set.date_of_sesh)
            formatted_date_time=format_time(datetime)

            set.date_of_sesh = formatted_date_time

        cardio_sets = fetch_last_workout_cardio_sets(workout_id)
        for set in cardio_sets:
            datetime = str(set.date_of_sesh)
            formatted_date_time = format_time(datetime)
            set.date_of_sesh = formatted_date_time
        return render_template('viewworkout.html', users_workouts=users_workouts, exercises=exercises, workout_name=workout_name, strength_sets=strength_sets, cardio_sets=cardio_sets)
    else:
        message = 'You must be logged in to view workouts. Please log in or make an account'
        return render_template('index.html', message=message, messageCategory='danger')

@application.get('/createworkout.html/')
def create_workout():
    if user_authenticated():
        if 'wo_name' in request.args:
            session['new_workout_name'] = request.args.get('wo_name')
            message = f'Workout named {session["new_workout_name"]} successfully'
        if 'new_exercise_name' in request.args:
            if 'new_exercises' in session.keys():
                new_exercises = session['new_exercises']
                new_exercises.update({request.args.get('new_exercise_name'): request.args.get('new_exercise_type')})
                session['new_exercises'] = new_exercises
                message = 'New exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
            else:
                session['new_exercises'] = {request.args.get('new_exercise_name'): request.args.get('new_exercise_type')}
                message = 'New exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
        if 'existing_exercise' in request.args:
            if 'existing_exercises' in session.keys():
                existing_exercises = session['existing_exercises']
                existing_exercises.append(request.args.get('existing_exercise'))
                session['existing_exercises'] = existing_exercises
                message = 'Existing exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')
            else:
                session['existing_exercises'] = [request.args.get('existing_exercise')]
                message = 'Existing exercise added to workout'
                return render_template('createworkout.html', message=message, messageCategory='success')

        return render_template('createworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message, messageCategory='danger')
@application.get('/nameworkout.html')
def name_workout():
    if user_authenticated():
        return render_template('nameworkout.html')
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message, messageCategory='danger')
@application.route('/remove/')
def remove_exercise():
    if user_authenticated():
        exName = request.args.get('remove')
        if session['existing_exercises']:
            if exName in session['existing_exercises']:
                exList = session['existing_exercises']
                exList.remove(exName)
                session['existing_exercises'] = exList
                message = 'Exercise removed'
                return render_template('createworkout.html', message=message, messageCategory='success')
        if session['new_exercises']:
            if exName in session['new_exercises'].keys():
                new_exercises = session['new_exercises']
                new_exercises.pop(exName)
                session['new_exercises'] = new_exercises
                message = 'Exercise removed'
                return render_template('createworkout.html', message=message, messageCategory='success')
        message = "Could  not remove exercise"
        return render_template('createworkout.html', message=message, messageCategory='danger')
    else:
        message='You must be logged in to edit workouts'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/addexistingexercise.html')
def add_existing_exercise():
    if user_authenticated():
        existing_exercises = fetch_users_exercises()
        showable_exercises = []
        for ex in existing_exercises:
            if ex.deleted is None or ex.deleted == 0:
                showable_exercises.append(ex)

        return render_template('addexistingexercise.html', existingExercises=showable_exercises)
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@application.get('/createexercise.html')
def create_exercise():
    if user_authenticated():
        return render_template('createexercise.html')
    else:
        message='You must be logged in to create exercises'
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/postworkout.html/')
def post_create_workout():
    if user_authenticated():
        if 'new_workout_name' not in session.keys():
            return render_template('createworkout.html', message='Must name workout to create it', messageCategory='danger')
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_workout_return_woID @workout_name='{session['new_workout_name']}' , @user_id={session['user_id']} , @wo_id=5000; SELECT @rv AS return_value; "
        cursor.execute(query)
        workout_id = cursor.fetchval()
        cnxn.commit()
        print('new workout id ='+ str(workout_id))

        #workout created, use workout_id to associate exercises to workout
        #build individual exercises
        existingExerciseNames = fetch_all_exercise_names()
        if 'new_exercises' in session.keys():
            for exName in session['new_exercises'].keys():
                if exName in existingExerciseNames:
                    #exercise with exName already exist, just associate it with the workout
                    ex_id = get_exercise_id(exName)
                    print('ex_id=' + str(ex_id))
                    query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                    cursor.execute(query)
                    cnxn.commit()
                else:
                    #exercise with exName is new and needs to be added to exercises
                    ex_type = session['new_exercises'].get(exName)
                    ex_type_id = 0
                    if ex_type == 'Strength':
                        ex_type_id = 1
                    else:
                        ex_type_id = 2
                    query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_exercise_return_exID '{exName}', {ex_type_id}, 0; SELECT @rv;"
                    cursor.execute(query)
                    ex_id = cursor.fetchval()
                    print('ex_id='+str(ex_id))
                    cnxn.commit()
                    query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                    cursor.execute(query)
                    cnxn.commit()
        if 'existing_exercises' in session.keys():
            for exName in session['existing_exercises']:
                ex_id = get_exercise_id(exName)
                print('existing_exercise_id=' + str(ex_id))
                query = f"EXEC associate_exercise_with_workout {workout_id}, {ex_id};"
                cursor.execute(query)
                cnxn.commit()
        cnxn.close()
        if 'new_workout_name' in session.keys():
            session.pop('new_workout_name')
        if 'new_exercises' in session.keys():
            session.pop('new_exercises')
        if 'existing_exercises' in session.keys():
            session.pop('existing_exercises')
        message = 'Workout created successfully'

        return redirect(url_for('home'))
    else:
        message = "You must be logged in to create workouts"
        return render_template(url_for('login.html'), message=message)

@application.route('/deleteworkout')
def delete_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('deleteworkout.html', workouts=users_workouts)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/deleteworkout/')
def post_delete_workout():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        delete_workout(workout_id)
        return redirect(url_for('home'))
    else:
        message = 'You are not logged in. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/editworkout')
def select_edit_workout():
    if user_authenticated():
        users_workouts = fetch_users_workouts()
        return render_template('editworkout.html', users_workouts=users_workouts)
    else:
        message = 'You are not logged in. Please log in or sign up to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/editworkout/')
def edit_workout():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        temp_ex = get_exercises_by_workout(workout_id)
        exercises = []
        for ex in temp_ex:
            if ex.deleted is None or ex.deleted == 0:
                exercises.append(ex)
        users_workouts = fetch_users_workouts()
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f'SELECT workout_name, workout_id FROM Workout WHERE workout_id={workout_id}'
        cursor.execute(query)
        result = cursor.fetchone()
        cnxn.close()
        workout_name = result.workout_name
        return render_template('editworkout.html', users_workouts=users_workouts, exercises=exercises, workout_name=workout_name, workout_id= result.workout_id)
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.get('/changename/')
def change_workout_name():
    if user_authenticated():
        workout_id = request.args.get('workout_id')
        session['workout_under_edit'] = workout_id
        workout_name = request.args.get('workout_name')
        return render_template('changename.html', workout_name=workout_name, workout_id=workout_id)
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.post('/postworkoutname/')
def post_change_workout_name():
    if user_authenticated():
        new_workout_name = request.form.get('new_workout_name')

        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"UPDATE Workout SET workout_name='{new_workout_name}' WHERE workout_id={session['workout_under_edit']}"
        cursor.execute(query)
        cnxn.commit()
        cnxn.close()
        message = 'Workout name has been changed. You can find it in your workouts under the new name: '+new_workout_name
        return redirect(url_for('home'))
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/addexercises/')
def add_exercises_to_workout():
    workout_id = request.args.get('workout_id')
    session['workout_under_edit'] = workout_id
    workout_name = request.args.get('workout_name')
    build_workout_ex_list_and_showable_ex_list()

    return render_template('addexercisetoworkout.html', workout_id=workout_id, workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'])
@application.route('/editworkout_addexistingexercise/')
def edit_workout_add_existing_exercises():
    if user_authenticated():
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT workout_name FROM Workout WHERE workout_id={session['workout_under_edit']}"
        result = cursor.execute(query).fetchone()
        workout_name = result[0]

        exercise_id = request.args.get('ex_id')
        print('exerciseId = '+str(exercise_id))
        query = f"SELECT exercise_name FROM Exercise WHERE exercise_id={exercise_id}"
        ex = cursor.execute(query).fetchall()
        exercise_name = ex[0]

        query = f"SELECT * FROM Workout_Exercise WHERE workout_id={session['workout_under_edit']} AND exercise_id={exercise_id};"
        dup = cursor.execute(query).fetchall()
        if dup:
            cnxn.close()
            return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'], workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'])
        else:
            query = f"INSERT INTO Workout_Exercise (workout_id, exercise_id) VALUES ({session['workout_under_edit']}, {exercise_id});"
            cursor.execute(query)
            cnxn.commit()
            cnxn.close()
            build_workout_ex_list_and_showable_ex_list()

            return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'], workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'] )
    else:
        message = 'You are not logged in. Please sign up or log in to continue.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/buildexforwo/')
def build_exercise_for_workout():

    if user_authenticated():
        exercise_name = request.args.get('exercise_name')
        exercise_type = request.args.get('exercise_type')
        exercises = fetch_users_exercises()
        exercise_names = []
        for exercise in exercises:
            exercise_names.append(exercise.exercise_name)

        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT workout_name FROM Workout WHERE workout_id={session['workout_under_edit']};"
        result = cursor.execute(query).fetchone()
        workout_name = result.workout_name
        print('exercise_type = ' + str(exercise_type))
        if exercise_name in exercise_names:
            ex_id = get_exercise_id(exercise_name)
            query = f"INSERT INTO Workout_Exercise (workout_id, exercise_id) VALUES ({session['workout_under_edit']}, {ex_id});"
            cursor.execute(query)
            cnxn.commit()
        else:
            if exercise_type == 'Strength':
                query = f"INSERT INTO Exercise (exercise_name, exercise_type_id) VALUES ('{exercise_name}', 1);"
            elif exercise_type == 'Cardio':
                query = f"INSERT INTO Exercise (exercise_name, exercise_type_id) VALUES ('{exercise_name}', 2);"
            cursor.execute(query)
            cnxn.commit()
            ex_id = get_exercise_id(exercise_name)

            query = f"INSERT INTO Workout_Exercise (workout_id, exercise_id) VALUES ({session['workout_under_edit']}, {ex_id});"
            cursor.execute(query)
            cnxn.commit()
        build_workout_ex_list_and_showable_ex_list()
        cnxn.close()

        return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'],
                               workout_name=workout_name, workoutExercises=session['workout_exercises'],
                               userExercises=session['showable_exercises'])
    else:
        message = "You are not logged in, please sign up or make an account to continue."
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/removeexercisefromworkout/')
def remove_exercise_from_workout():
    ex_id = request.args.get('ex_id')
    wo_id = request.args.get('wo_id')

    #mark wo_ex_id with deleted=1
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"UPDATE Workout_Exercise SET deleted=1 WHERE workout_id={wo_id} AND exercise_id={ex_id};"
    cursor.execute(query)
    cnxn.commit()
    query = f"SELECT workout_name FROM Workout WHERE workout_id={wo_id};"
    result = cursor.execute(query).fetchone()
    workout_name=result[0]
    cnxn.close()
    build_workout_ex_list_and_showable_ex_list()
    return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'],
                           workout_name=workout_name, workoutExercises=session['workout_exercises'],
                           userExercises=session['showable_exercises'])


@application.route('/selectworkout')
def select_workout():
    if user_authenticated():
        workouts = fetch_users_workouts()
        return render_template('selectworkout.html', workouts=workouts)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/displayselectedworkout/')
def display_selected_workout():
    if user_authenticated():
        workouts = fetch_users_workouts()
        wo_id = request.args.get('workout_id')
        workout_name = get_workout_name(wo_id)
        results = get_exercises_by_workout(wo_id)
        exercises = []
        for result in results:
            if result.deleted is None or result.deleted == 0:
                exercises.append(result)

        return render_template('selectworkout.html', workouts=workouts, wo_id=wo_id, wo_name=workout_name, workout_exercises=exercises)

    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/startworkout/')
def start_workout():
    if user_authenticated():
        wo_id = request.args.get('workout_id')
        session['workout_in_progress_id'] = wo_id
        session['workout_in_progress_name'] = get_workout_name(wo_id)
        starting = request.args.get('starting')
        if starting == 'True':
            sesh = build_sesh()
            session['sesh_in_progress_id'] = sesh.sesh_id
            session['sesh_in_progress_date'] = str(sesh.date_of_sesh)

        date = session['sesh_in_progress_date']
        formatted_date_time= format_time(date)

        results = get_exercises_by_workout(wo_id)
        exercises = []
        session['exercises_with_sets'] = {}

        for result in results:
            if result.deleted is None or result.deleted == 0:
                exercises.append(result)
                session['exercises_with_sets'].update({result.wo_ex_id : False})

        markExercises()
        return render_template('workoutsesh.html', exercises=exercises, formatted_date_time=formatted_date_time)

    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/startexercise/')
def start_exercise():
    if user_authenticated():
        ex_id = request.args.get('ex_id')
        exercise_id = 0
        cnxn = get_db()
        cursor = cnxn.cursor()

        if ex_id:
            query = f"SELECT * FROM Exercise WHERE exercise_id={ex_id};"
            exercise = cursor.execute(query).fetchone()
            query = f"SELECT wo_ex_id From Workout_Exercise WHERE workout_id={session['workout_in_progress_id']} AND exercise_id={ex_id};"
            session['current_wo_ex_id'] = cursor.execute(query).fetchval()
        else:
            query = f"SELECT exercise_id FROM Workout_Exercise WHERE wo_ex_id={session['current_wo_ex_id']};"
            exercise_id = cursor.execute(query).fetchval()
            query = f"SELECT * FROM Exercise WHERE exercise_id={exercise_id};"
            exercise = cursor.execute(query).fetchone()
        query = f"SELECT * FROM Strength_Set WHERE sesh_id={session['sesh_in_progress_id']} AND wo_ex_id={session['current_wo_ex_id']};"
        results = cursor.execute(query).fetchall()
        completedSets = []
        for result in results:
            completedSets.append(result)
        query = f"SELECT * FROM Cardio_Set WHERE sesh_id={session['sesh_in_progress_id']} AND wo_ex_id={session['current_wo_ex_id']};"
        results = cursor.execute(query).fetchall()
        for result in results:
            completedSets.append(result)

        #fetch sets from last workout
        sets = []

        if ex_id:
            sets = fetch_last_workout_sets_by_exercise(ex_id)
            if sets:
                print(str(sets[0].date_of_sesh) + " !=!=! " + session['sesh_in_progress_date'])
                if str(sets[0].date_of_sesh) == session['sesh_in_progress_date']:
                     return render_template('doexercise.html', exercise=exercise, completedSets=completedSets)

                for set in sets:
                    formatted_date_time = format_time(set.date_of_sesh)
                    set.date_of_sesh = formatted_date_time
        else:
            sets = fetch_last_workout_sets_by_exercise(exercise_id)
            if sets:
                if str(sets[0].date_of_sesh) == session['sesh_in_progress_date']:
                    return render_template('doexercise.html', exercise=exercise, completedSets=completedSets)
                for set in sets:
                    formatted_date_time = format_time(set.date_of_sesh)
                    set.date_of_sesh = formatted_date_time
        cnxn.close()
        return render_template('doexercise.html', exercise=exercise, completedSets=completedSets, last_workout_sets=sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/submitstrengthset/')
def submit_strength_set():
    if user_authenticated():
        ex_id = request.args.get('ex_id')
        num_reps = request.args.get('num_reps')
        weight_amnt = request.args.get('weight_amnt')
        weight_metric = request.args.get('weight_metric')
        wo_ex_id = session['current_wo_ex_id']
        submitStrengthSet(wo_ex_id, session['sesh_in_progress_id'], num_reps, weight_amnt, weight_metric)

        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT * FROM Exercise WHERE exercise_id={ex_id};"
        exercise = cursor.execute(query).fetchone()
        query = f"SELECT * FROM Strength_Set WHERE sesh_id={session['sesh_in_progress_id']} AND wo_ex_id={session['current_wo_ex_id']};"
        results = cursor.execute(query).fetchall()
        completedSets = []
        for result in results:
            completedSets.append(result)

        cnxn.close()

        return render_template('doexercise.html', exercise=exercise, completedSets=completed_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

@application.route('/submitcardioset/')
def submit_cardio_set():
    if user_authenticated():

        wo_ex_id = session['current_wo_ex_id']
        sesh_id = session['sesh_in_progress_id']
        print('sesh_id='+str(sesh_id))
        duration_amnt = request.args['duration_amnt']
        print('duration_amnt=' + str(duration_amnt))
        duration_metric = request.args['duration_metric']
        print('duration_metric=' + str(duration_metric))
        distance_amnt = request.args['distanceAmnt']
        print('distance_amnt=' + str(distance_amnt))
        distance_metric = request.args['distanceMetric']
        print('distance_metric=' + str(distance_metric))
        set_id = submitCardioSet(int(wo_ex_id), int(sesh_id), float(duration_amnt), str(duration_metric), float(distance_amnt), str(distance_metric))
        print('set_id='+str(set_id))

        cnxn = get_db()
        cursor = cnxn.cursor()
        query = f"SELECT exercise_id FROM Workout_Exercise WHERE wo_ex_id={wo_ex_id}"
        ex_id = cursor.execute(query).fetchval()
        print('**Ex_id='+str(ex_id))
        query = f"SELECT * FROM Exercise WHERE exercise_id={ex_id};"
        exercise = cursor.execute(query).fetchone()
        print(str(exercise.exercise_name)+' - '+str(exercise.exercise_id))
        print('sesh_id='+str(sesh_id)+', wo_ex_id='+str(wo_ex_id))
        query = f"SELECT * FROM Cardio_Set WHERE sesh_id={sesh_id} AND wo_ex_id={wo_ex_id};"
        results = cursor.execute(query).fetchall()
        completed_sets = []
        for result in results:
            completed_sets.append(result)
        cnxn.close()
        return render_template('doexercise.html', exercise=exercise, completedSets=completed_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/deleteset/')
def delete_set():
    set_id = request.args.get('set_id')
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"DELETE FROM Strength_Set WHERE s_set_number={set_id};"
    cursor.execute(query)
    query = f"DELETE FROM Cardio_Set WHERE c_set_number={set_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
    return redirect(url_for('start_exercise'))

@application.route('/endworkout/')
def end_workout():
    if user_authenticated():
        workout_name = session['workout_in_progress_name']

        message = f"{workout_name} completed. Nice work!"
        return redirect(url_for('home'))


    else:
        message = "You are not logged in. Please login or create an account to continue."
        return render_template('index.html', message=message, messageCategory='danger')

def format_time(datetime):
    datetime = str(datetime)
    months = {1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August',
              9: 'September', 10: 'October', 11: 'November', 12: 'December'}
    time = datetime[11:16]
    year = datetime[:4]
    month = datetime[5:7]
    day = datetime[8:10]
    formatted_date_time = f"{months.get(int(month))} {day}, {year} at {time}"
    return formatted_date_time
def fetch_last_workout_strength_sets(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_last_workout_strength_sets {int(workout_id)};"
    strength_sets = cursor.execute(query).fetchall()
    cnxn.close()
    return strength_sets
def fetch_last_workout_cardio_sets(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_last_workout_cardio_sets {int(workout_id)};"
    cardio_sets = cursor.execute(query).fetchall()
    cnxn.close()
    return cardio_sets

def fetch_last_workout_sets_by_exercise(exercise_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_last_workout_sets_by_exercise {session['workout_in_progress_id']}, {int(exercise_id)};"
    sets = cursor.execute(query).fetchall()
    cnxn.close()
    if sets:
        return sets
    else:
        return None
def markExercises():
    strength_sets = fetch_strength_sets_by_user()
    cardio_sets = fetch_cardio_sets_by_user()
    for set in strength_sets:
        if set.wo_ex_id in session['exercises_with_sets'].keys() and set.sesh_id == session['sesh_in_progress_id']:
            session['exercises_with_sets'].update({set.wo_ex_id : True})
    for set in cardio_sets:
        if set.wo_ex_id in session['exercises_with_sets'].keys() and set.sesh_id == session['sesh_in_progress_id']:
            session['exercises_with_sets'].update({set.wo_ex_id : True})


def submitStrengthSet(wo_ex_id, sesh_id, num_reps, weight_amnt, weight_metric):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_strength_set @wo_ex_id={wo_ex_id}, @sesh_id={sesh_id}, @number_of_reps={num_reps}, @weight_amount={weight_amnt}, @weight_metric='{weight_metric}', @set_number=0; SELECT @rv"
    set_number = cursor.execute(query).fetchval()
    cnxn.commit()
    cnxn.close()
    return set_number

def submitCardioSet(wo_ex_id, sesh_id, duration_amount, duration_metric, distance_amount, distance_metric):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"SET NOCOUNT ON; DECLARE @set_id int; EXEC @set_id = build_cardio_set {wo_ex_id}, {sesh_id}, {duration_amount}, '{duration_metric}', {distance_amount}, '{distance_metric}', 0; SELECT @set_id;"
    set_id = cursor.execute(query).fetchval()
    cnxn.commit()
    cnxn.close()
    return set_id
def get_workout_name(workout_id):
     cnxn = get_db()
     cursor = cnxn.cursor()
     query = f"SELECT workout_name FROM Workout WHERE workout_id={workout_id};"
     result = cursor.execute(query).fetchone()
     workout_name = result[0]
     cnxn.close()
     return workout_name
def build_sesh():
     cnxn = get_db()
     cursor = cnxn.cursor()
     query = f"SET NOCOUNT ON; DECLARE @rv int; EXEC @rv = build_sesh_return_sesh @user_id={session['user_id']}, @workout_id={session['workout_in_progress_id']}, @sesh_id=0; SELECT @rv AS return_value;"
     sesh_id = cursor.execute(query).fetchval()
     cnxn.commit()
     query = f"SELECT * FROM Sesh WHERE sesh_id={sesh_id};"
     sesh = cursor.execute(query).fetchone()
     cnxn.close()
     return sesh


def user_authenticated():
    if session.get('user_id') is None:
        return False
    return True

def update_user_email(new_email):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"UPDATE Users SET email='{new_email}' WHERE user_id={session['user_id']}"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()


def update_user_password(new_password):
    cnxn = get_db()
    cursor = cnxn.cursor()
    hash = pbkdf2_sha256.hash(new_password)
    query = f"UPDATE Users SET password='{hash}' WHERE user_id={session['user_id']}; "
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def delete_user_account(user_id):
    cardio_sets = fetch_cardio_sets_by_user()
    if cardio_sets:
        for set in cardio_sets:
            delete_set(set.c_set_number, 'Cardio', set.wo_ex_id)
    strength_sets = fetch_strength_sets_by_user()
    if strength_sets:
        for set in strength_sets:
            delete_set(set.s_set_number, 'Strength', set.wo_ex_id)
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    if wo_ex_ids:
        for id in wo_ex_ids:
                delete_wo_ex(id.wo_ex_id)
    seshs = fetch_sesh_ids_by_user()
    if seshs:
        for sesh in seshs:
            delete_sesh(sesh.sesh_id)
    workouts = fetch_all_user_workouts()
    if workouts:
        for workout in workouts:
                permanently_delete_workout(workout.workout_id)
        delete_user()
def fetch_wo_ex_ids_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_wo_ex_ids_by_user @user_id={session['user_id']};"
    cursor.execute(query)
    results = cursor.fetchall()
    ids = []
    for result in results:
        if result.deleted is None or result.deleted == 0:
            ids.append(result.wo_ex_id)
    cnxn.close()
    return ids
def fetch_cardio_sets_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_cardio_sets_by_user @user_id=?;"
    cursor.execute(query, session['user_id'])
    sets = cursor.fetchall()
    cnxn.close()
    return sets
def fetch_sesh_ids_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f'EXEC fetch_sesh_ids_by_user @user_id={session["user_id"]}'
    cursor.execute(query)
    ids = cursor.fetchall()
    cnxn.close()
    return ids
def fetch_strength_sets_by_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_strength_sets_by_user @user_id=?;"
    cursor.execute(query, session['user_id'])
    sets = cursor.fetchall()
    cnxn.close()
    return sets
def delete_user():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"DELETE FROM Users WHERE user_id={session['user_id']};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
    session.clear()
def delete_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query=f"EXEC delete_workout @workout_id={int(workout_id)};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def permanently_delete_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC permanently_delete_workout @workout_id={workout_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def delete_sesh(sesh_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_sesh @sesh_id={sesh_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
def delete_wo_ex(wo_ex_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_wo_ex @wo_ex_id={wo_ex_id}"
    cursor.execute(query)
    cnxn.commit()
    print('wo_ex deleted')
    cnxn.close()
def delete_set(set_number, set_type, wo_ex_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC delete_set @set_number={set_number} , @set_type='{set_type}' , @wo_ex_id={wo_ex_id};"
    cursor.execute(query)
    cnxn.commit()
    cnxn.close()
    print('set deleted')

def count_user_total_reps_of_exercise(exercise_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC count_user_total_reps @exercise_id={exercise_id}, @num_reps = 0"
def fetch_users_workouts():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_user_workouts @user_id=?"
    params = session['user_id']
    cursor.execute(query, params)
    results = cursor.fetchall()
    cnxn.close()
    return results
def fetch_all_user_workouts():
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC fetch_all_user_workouts @user_id=?"
    params = session['user_id']
    cursor.execute(query, params)
    results = cursor.fetchall()
    cnxn.close()
    return results

def fetch_users_exercises():
        cnxn = get_db()
        cursor = cnxn.cursor()
        query = "EXEC fetch_user_exercises "+str(session['user_id'])
        results = cursor.execute(query).fetchall()
        cnxn.close()
        return results;
def fetch_all_exercise_names() -> []:
    cnxn = get_db()
    cursor = cnxn.cursor()
    query='EXEC fetch_all_exercise_names;'
    results = cursor.execute(query).fetchall()
    ex_names = []
    for result in results:
        ex_names.append(result.exercise_name)
    cnxn.close()
    return ex_names
def get_exercise_id(exName) -> id:
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC get_exercise_id '{exName}', 0;"
    row = cursor.execute(query).fetchone()
    id = row[0]
    cnxn.close()
    return id

def get_exercises_by_workout(workout_id):
    cnxn = get_db()
    cursor = cnxn.cursor()
    query = f"EXEC get_exercises_by_workout @workout_id=?"
    cursor.execute(query, workout_id)
    results = cursor.fetchall()
    cnxn.close()
    return results

def build_workout_ex_list_and_showable_ex_list():
    exercises = get_exercises_by_workout(session['workout_under_edit'])
    workout_exercises = {}
    for exercise in exercises:
        if exercise.deleted is None or exercise.deleted==0:
            workout_exercises.update({exercise.exercise_id: exercise.exercise_name})
    session['workout_exercises'] = workout_exercises
    user_exercises = fetch_users_exercises()
    showable_exercises = {}
    for exercise in user_exercises:
        if exercise.deleted is None or exercise.deleted == 0:
            if exercise.exercise_id not in session['workout_exercises'].keys():
                showable_exercises.update({exercise.exercise_id: exercise.exercise_name})
    session['showable_exercises'] = showable_exercises

if __name__ == "__main__":
    db.drop_all()
    db.create_all()
    application.run(debug=True)



