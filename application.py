from flask import Flask, escape, render_template, request, session, redirect, url_for
from passlib.hash import pbkdf2_sha256
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import and_
import pandas as pd
import numpy as np
import json
import plotly
from plotly import utils
import plotly.express as px
import os

db = SQLAlchemy()

application = Flask(__name__)
uri = f"mysql://{'root'}:{'Bond7007!'}@{'localhost'}:3306/{'swolltech'}"
application.config['SQLALCHEMY_DATABASE_URI'] = uri
application.config['SECRET_KEY'] = "testing key"

db.init_app(application)

class Users(db.Model):

    user_id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), unique=False, nullable=False)
    lname = db.Column(db.String(80), unique=False, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    dob = db.Column(db.DateTime, unique=False, nullable=False)
    password = db.Column(db.String(200), unique=False, nullable=False)

class Workout(db.Model):
    workout_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_name = db.Column(db.String(100), unique=False, nullable=False)
    deleted = db.Column(db.Boolean)

class Sesh(db.Model):
    sesh_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    date_of_sesh = db.Column(db.DateTime)
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
    deleted = db.Column(db.Boolean)

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

    user = db.session.execute(db.select(Users).where(Users.email == email)).scalar_one_or_none()
    if user:  # if user already exists, render login
        message = "That email is already associated with an account, please log in instead"
        return render_template('login.html', message=message, messageCategory='danger')
    else: #valid new user, try adding to db
        try:
            hashword = pbkdf2_sha256.hash(password)
            user = Users(fname=fname, lname=lname, email=email, dob=dob, password=hashword)
            print(user.fname + " model created...")
            db.session.add(user)
            db.session.commit()
            print("User successfully commited to db")
            message = "Sign up successful. Please log in to your new account"
            return render_template(url_for('login'), message=message, messageCategory='success')

        except:
            db.session.delete(user)
            message = "There was an error during the sign up process. Please try again."
            print('Error committing user to db')
            return render_template(url_for('get_signup'), message=message, messageCategory='danger')


@application.route('/login.html', methods=['GET', 'POST'])
def login(user=None, message=""):
    if request.method == 'GET':
        return render_template('login.html')
    else:
        username = request.form.get('username')
        password = request.form.get('loginpassword')

        result = db.session.execute(db.select(Users).where(Users.email==username)).scalar_one_or_none()


        if not result:
            message = "No user exists with that email, please try again"
            return render_template(url_for('login'), message=message, messageCategory='danger')
        else:
            if pbkdf2_sha256.verify(password, result.password):
                session['logged_in'] = True
                session['user_id'] = result.user_id
                session['email'] = result.email
                session['fname'] = result.fname
                session['lname'] = result.lname
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

        password = request.form.get('password')

        user = db.session.execute(db.select(Users).where(Users.user_id==session['user_id'])).scalar_one_or_none()
        existing_password = user.password

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
            return render_template('changeemail.html', message='Password required to update account', messageCategory='danger')
    else:
        message = 'You are not logged in. Please log in or create an account.'
        return render_template('index.html', message=message, messageCategory='danger')

@application.post('/change_password/')
def change_password():
    if user_authenticated():
        curr_password = request.form['curr_password']
        new_password = request.form['new_password']
        conf = request.form['conf_new_password']
        user = db.session.execute(db.select(Users).where(Users.user_id==session['user_id'])).scalar_one_or_none()
        if pbkdf2_sha256.verify(curr_password, user.password):
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

    # NEED TO BUILD USEFUL GRAPH DISPLAY HERE
    results = None
    if results is None or len(results) == 0:
        return render_template('home.html', message='Graphing features will be available on the home screen very soon!', messageCategory='success')


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
        if existing_exercises:
            for ex in existing_exercises:
                if ex.deleted is None or ex.deleted == 0:
                    showable_exercises.append(ex)
            return render_template('addexistingexercise.html', existingExercises=showable_exercises)
        else:
            return render_template('createworkout.html', message="You don't have any existing exercises, create new exercises to build your first workout", messageCategory='danger')


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
        #make sure user doesnt have any other workouts with the same name
        workouts = db.session.execute(db.select(Workout).where(Workout.user_id==session['user_id'])).scalars()
        workout_names = []
        for workout in workouts:
            workout_names.append(workout.workout_name)
        if session['new_workout_name'] in workout_names:
            return render_template('createworkout.html', message='That workout name is in use for another workout, please rename your workout and recreate', messageCategory='danger')

        workout = Workout(
            user_id=session['user_id'],
            workout_name=session['new_workout_name'],
            deleted=0
        )
        db.session.add(workout)
        db.session.commit()
        wo = db.session.execute(db.select(Workout).filter(Workout.user_id==session['user_id'], Workout.workout_name==session['new_workout_name'])).scalar_one_or_none()
        workout_id = wo.workout_id

        #workout created, use workout_id to associate exercises to workout
        #build individual exercises
        existingExerciseNames = fetch_all_exercise_names()
        if 'new_exercises' in session.keys():
            for exName in session['new_exercises'].keys():
                if exName in existingExerciseNames:
                    #exercise with exName already exist, just associate it with the workout
                    ex_id = get_exercise_id(exName)
                    wo_ex = Workout_Exercise(
                        workout_id=session['workout_in_progress_id'],
                        exercise_id=ex_id,
                        deleted=0
                    )
                    db.session.add(wo_ex)
                    db.session.commit()
                else:
                    #exercise with exName is new and needs to be added to exercises
                    ex_type = session['new_exercises'].get(exName)
                    ex_type_id = 0
                    if ex_type == 'Strength':
                        ex_type_id = 1
                    else:
                        ex_type_id = 2

                    exercise = Exercise(
                        exercise_name=exName,
                        exercise_type_id=ex_type_id
                    )
                    db.session.add(exercise)
                    db.session.commit()
                    exercise = db.session.execute(db.select(Exercise).filter(Exercise.exercise_name==exName, Exercise.exercise_type_id==ex_type_id))
                    exercise_id = exercise.exercise_id
                    workout_exercise = Workout_Exercise(
                        workout_id=workout_id,
                        exercise_id=exercise_id,
                        deleted=0
                    )
                    db.session.add(workout_exercise)
                    db.session.commit()
        if 'existing_exercises' in session.keys():
            for exName in session['existing_exercises']:
                ex_id = get_exercise_id(exName)
                workout_exercise = Workout_Exercise(
                    workout_id=workout_id,
                    exercise_id=ex_id,
                    deleted=0
                )
                db.session.add(workout_exercise)

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
        workout = db.session.execute(db.select(Workout).where(Workout.workout_id==workout_id))
        workout_name = workout.workout_name
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
        workout = db.session.execute(db.select(Workout).where(Workout.workout_id==session['workout_under_edit'])).scalar_one_or_none()
        workout.name = new_workout_name
        db.session.commit()
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
        exercise_id = request.args.get('ex_id')
        workout = db.session.execute(db.select(Workout).where(Workout.workout_id==session['workout_under_edit'])).scalar_one_or_none()
        workout_name = workout.workout_name
        exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==exercise_id)).scalar_one_or_none()
        exercise_name = exercise.exercise_name

        dup = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.workout_id==workout.workout_id, Workout_Exercise.exercise_id==exercise_id)).scalar_one_or_none()
        if dup:
            return render_template('addexercisetoworkout.html', workout_id=session['workout_under_edit'], workout_name=workout_name, workoutExercises=session['workout_exercises'], userExercises=session['showable_exercises'])
        else:
            workout_exercise = Workout_Exercise(
                workout_id=workout.workout_id,
                exercise_id=exercise_id,
                deleted=0
            )
            db.session.add(workout_exercise)
            db.session.commit()
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

        workout = db.session.execute(db.select(Workout).where(Workout.workout_id==session['workout_under_edit']))

        #exercise already exists for user, so just associate it with the workout
        if exercise_name in exercise_names:
            ex_id = get_exercise_id(exercise_name)
            wo_ex = Workout_Exercise(
                workout_id=session['workout_under_edit'],
                exercise_id=ex_id,
                deleted=0
            )
            db.session.add(wo_ex)
            db.session.commit()
        else:
            if exercise_type == 'Strength':
                exercise = Exercise(
                    exercise_name=exercise_name,
                    exercise_type_id=1
                )
                db.session.add(exercise)
                db.session.commit()
            elif exercise_type == 'Cardio':
                exercise = Exercise(
                    exercise_name=exercise_name,
                    exercise_type_id=2
                )
                db.session.add(exercise)
                db.session.commit()

            ex_id = get_exercise_id(exercise_name)
            workout_exercise = Workout_Exercise(
                workout_id=session['workout_under_edit'],
                exercise_id=ex_id,
                deleted=0
            )
            db.session.add(workout_exercise)
            db.session.commit()

        build_workout_ex_list_and_showable_ex_list()
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
    wo_ex = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.workout_id==wo_id, Workout_Exercise.exercise_id==ex_id)).scalar_one_or_none()
    wo_ex.deleted=1
    db.session.commit()

    workout_name = db.session.execute(db.select(Workout).where(Workout.workout_id==wo_id))
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

        if ex_id:
            exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==ex_id)).scalar_one_or_none()
            wo_ex = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.exercise_id==ex_id, Workout_Exercise.workout_id==session['workout_in_progress_id'])).scalar_one_or_none()
            session['current_wo_ex_id'] = wo_ex.wo_ex_id
        else:
            wo_ex = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.wo_ex_id==session['current_wo_ex_id'])).scalar_one_or_none()
            exercise_id = wo_ex.exercise_id
            exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==exercise_id)).scalar_one_or_none()

        results = db.session.execute(db.select(Strength_Set).filter(Strength_Set.sesh_id==session['sesh_in_progress_id'], Strength_Set.wo_ex_id==session['current_wo_ex_id'])).scalars()

        completedSets = []
        for result in results:
            completedSets.append(result)
        results = db.session.execute(db.select(Cardio_Set).filter(Cardio_Set.sesh_id==session['sesh_in_progress_id'], Cardio_Set.wo_ex_id==session['current_wo_ex_id'])).scalars()
        for result in results:
            completedSets.append(result)

        #fetch sets from last workout
        sets = []

        if ex_id:
            sets = fetch_last_workout_sets_by_exercise(ex_id)
            if sets:
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

        return render_template('doexercise.html', exercise=exercise, completedSets=completedSets, last_workout_sets=sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')
@application.route('/submitstrengthset/')
def submit_strength_set():
    if user_authenticated():
        ex_id = request.args.get('ex_id')
        num_reps = request.args.get('num_reps')
        weight_amount = request.args.get('weight_amnt')
        weight_metric = request.args.get('weight_metric')
        wo_ex_id = session['current_wo_ex_id']
        submitStrengthSet(wo_ex_id, session['sesh_in_progress_id'], num_reps, weight_amount, weight_metric)
        # set is submitted, reload all the completed sets so far
        exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==ex_id)).scalar_one_or_none()
        completed_sets = db.session.execute(db.select(Strength_Set).filter(Strength_Set.sesh_id==session['sesh_in_progress_id'], Strength_Set.wo_ex_id==session['current_wo_ex_id'])).scalars()
        return render_template('doexercise.html', exercise=exercise, completedSets=completed_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')

#UPDATED, NEEDS TESTING
@application.route('/submitcardioset/')
def submit_cardio_set():
    if user_authenticated():
        wo_ex_id = session['current_wo_ex_id']
        sesh_id = session['sesh_in_progress_id']
        duration_amnt = request.args['duration_amnt']
        duration_metric = request.args['duration_metric']
        distance_amnt = request.args['distanceAmnt']
        distance_metric = request.args['distanceMetric']
        set_id = submitCardioSet(int(wo_ex_id), int(sesh_id), float(duration_amnt), str(duration_metric), float(distance_amnt), str(distance_metric))
        #set is submitted, reload all the completed sets so far
        workout_exercise = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.wo_ex_id==wo_ex_id)).scalar_one_or_none()
        exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==workout_exercise.exercise_id)).scalar_one_or_none()
        completed_sets = db.session.execute(db.select(Cardio_Set).filter(Cardio_Set.sesh_id==sesh_id, Cardio_Set.wo_ex_id==wo_ex_id)).scalars()
        return render_template('doexercise.html', exercise=exercise, completedSets=completed_sets)
    else:
        message = "You are not logged in. Please log in or sign up to continue."
        return render_template('index.html', message=message, messageCategory='danger')


@application.route('/deleteset/')
def delete_set():
    set_id = request.args.get('set_id')
    db.session.execute(db.session.delete(Cardio_Set).where(Cardio_Set.c_set_number == set_id))
    db.session.commit()
    db.session.execute(db.session.delete(Strength_Set).where(Strength_Set.s_set_number == set_id))
    db.session.commit()
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

#UPDATED, NEEDS TESTING
def fetch_last_workout_strength_sets(workout_id):
    sesh = db.session.execute(db.select(Sesh).where(Sesh.workout_id==workout_id).orderby(Sesh.date_of_sesh)).scalar_one_or_none()
    sets = db.session.execute(db.select(Strength_Set).where(Strength_Set.sesh_id==sesh.sesh_id)).scalars()
    return sets

#UPDATED, NEEDS TESTING
def fetch_last_workout_cardio_sets(workout_id):
    sesh = db.session.execute(db.select(Sesh).where(Sesh.workout_id==workout_id).orderby(Sesh.date_of_sesh)).scalar_one_or_none()
    sets = db.session.execute(db.select(Cardio_Set).where(Cardio_Set.sesh_id==sesh.sesh_id)).scalars()
    return sets

#UPDATED BUT NEEDS SERIOUS TESTING
def fetch_last_workout_sets_by_exercise(exercise_id):
    sesh = db.session.execute(db.select(Sesh).where(Sesh.workout_id==session['workout_in_progress_id']).orderby(Sesh.date_of_sesh)).scalar_one_or_none()
    wo_exs = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.workout_id==session['workout_in_progress_id'], Workout_Exercise.exercise_id==exercise_id)).scalars()
    wo_ex_ids = []
    for ex in wo_exs:
        wo_ex_ids.append(ex.wo_ex_id)
    exercise = db.session.execute(db.select(Exercise).where(Exercise.exercise_id==exercise_id)).scalar_one_or_none()
    if exercise.exercise_type_id == 1:
        #find strength sets
        sets = db.session.execute(db.select(Strength_Set).filter(Strength_Set.sesh_id==sesh.sesh_id, Strength_Set.wo_ex_id.in_(wo_ex_ids)))
    else:
        #find cardio sets
        sets = db.session.execute(db.select(Cardio_Set).filter(Cardio_Set.sesh_id==sesh.sesh_id, Cardio_Set.wo_ex_id.in_(wo_ex_ids)))


#UPDATED, NEEDS TESTED
def markExercises():
    strength_sets = fetch_strength_sets_by_user()
    cardio_sets = fetch_cardio_sets_by_user()
    for set in strength_sets:
        if set.wo_ex_id in session['exercises_with_sets'].keys() and set.sesh_id == session['sesh_in_progress_id']:
            session['exercises_with_sets'].update({set.wo_ex_id : True})
    for set in cardio_sets:
        if set.wo_ex_id in session['exercises_with_sets'].keys() and set.sesh_id == session['sesh_in_progress_id']:
            session['exercises_with_sets'].update({set.wo_ex_id : True})

#UPDATED, NEEDS TESTED
def submitStrengthSet(wo_ex_id, sesh_id, num_reps, weight_amount, weight_metric):
    strength_set = Strength_Set(
        wo_ex_id=wo_ex_id,
        sesh_id=sesh_id,
        num_reps=num_reps,
        weight_amount=weight_amount,
        weight_metric=weight_metric
    )
    db.session.add(strength_set)
    db.session.commit()
    db.session.refresh(strength_set)
    return strength_set.s_set_number

#UPDATED, NEEDS TESTED
def submitCardioSet(wo_ex_id, sesh_id, duration_amount, duration_metric, distance_amount, distance_metric):
    cardio_set = Cardio_Set(
        wo_ex_id=wo_ex_id,
        sesh_id=sesh_id,
        duration_amount=duration_amount,
        duration_metric=duration_metric,
        distance_amount=distance_amount,
        distance_metric=distance_metric
    )
    db.session.add(cardio_set)
    db.session.commit()
    db.session.refresh(cardio_set)
    return cardio_set.c_set_number

#UPDATED, NEEDS TESTED
def get_workout_name(workout_id):
     workout = db.session.execute(db.select(Workout).where(Workout.workout_id == workout_id)).scalar_one_or_none()
     return workout.workout_name

# UPDATED, NEEDS TESTED
def build_sesh():
    sesh = Sesh(
        user_id=session['user_id'],
        workout_id=session['workout_in_progress_id']
    )
    db.session.add(sesh)
    db.session.commit()
    db.session.refresh(sesh)
    return sesh

#UPDATED, NEEDS TESTED
def user_authenticated():
    if session.get('user_id') is None:
        return False
    return True

#UPDATED, TESTED
def update_user_email(new_email):
    db.session.execute(db.update(Users).where(Users.user_id == session['user_id']).values(email=new_email))
    db.session.commit()
    print('email updated')

#UPDATED
def update_user_password(new_password):
    hashword = pbkdf2_sha256.hash(new_password)
    db.session.execute(db.update(Users).where(Users.user_id == session['user_id']).values(password=hashword))
    db.session.commit()
    print('password upated')

#UPDATED, NEEDS TESTED
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
            delete_wo_ex(id)
    seshs = fetch_sesh_ids_by_user()
    if seshs:
        for sesh in seshs:
            delete_sesh(sesh.sesh_id)
    workouts = fetch_all_user_workouts()
    if workouts:
        for workout in workouts:
                permanently_delete_workout(workout.workout_id)
        delete_user()

#UPDATED, NEEDS TESTED
def fetch_wo_ex_ids_by_user():
    users_workouts = db.session.execute(db.select(Workout).where(Workout.user_id == session['user_id'])).scalars()
    workout_ids = []
    for workout in users_workouts:
        workout_ids.append(workout.workout_id)
    workout_exercises = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.workout_id.in_(workout_ids))).scalars()
    wo_ex_ids = []
    for wo_ex in workout_exercises:
        wo_ex_ids.append(wo_ex.wo_ex_id)
    return wo_ex_ids

#UPDATED, NEEDS TESTED
def fetch_cardio_sets_by_user():
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    sets = db.session.execute(db.select(Cardio_Set).where(Cardio_Set.wo_ex_id.in_(wo_ex_ids))).scalars()
    return sets

#UPDATED, NEEDS TESTED
def fetch_sesh_ids_by_user():
    ids = db.session.execute(db.select(Sesh).where(Sesh.user_id==session['user_id'])).scalars()
    return ids

#UPDATED, NEEDS TESTED
def fetch_strength_sets_by_user():
    #use the session['user_id'] to get
    # all strength sets associated with this user
    wo_ex_ids = fetch_wo_ex_ids_by_user()
    sets = db.session.execute(db.select(Strength_Set).where(Strength_Set.wo_ex_id.in_(wo_ex_ids))).scalars()
    return sets

#UPDATED, NEEDS TESTED
def delete_user():
    db.session.delete(Users).where(Users.user_id==session['user_id'])
    db.session.commit()
    session.clear()

#UPDATED, NEEDS TESTED
def delete_workout(workout_id):
    workout = db.session.execute(db.select(Workout).where(Workout.workout_id==workout_id)).scalar_one_or_none()
    if not workout:
        print("Error, could not find the workout with that workout_id")
    workout.deleted = 1
    db.session.commit()

#UPDATED, NEEDS TESTED
def permanently_delete_workout(workout_id):
    db.session.delete(Workout).where(Workout.workout_id==workout_id)
    db.session.commit()

#UPDATED, NEEDS TESTED
def delete_sesh(sesh_id):
    db.session.delete(Sesh).where(Sesh.sesh_id==sesh_id)
    db.commit()

#UPDATED, NEEDS TESTED
def delete_wo_ex(wo_ex_id):
    db.session.execute(db.session.delete(Workout_Exercise).where(Workout_Exercise.wo_ex_id==wo_ex_id))
    db.session.commit()

#UPDATED, NEEDS TESTED
def delete_set(set_number, set_type, wo_ex_id):

    if set_type == 'Cardio':
        db.session.execute(db.session.delete(Cardio_Set).filter(Cardio_Set.c_set_number == set_number, Cardio_Set.wo_ex_id==wo_ex_id))
        db.session.commit()
    elif set_type == 'Strength':
        db.session.execute(db.session.delete(Strength_Set).filter(Strength_Set.s_set_number == set_number, Strength_Set.wo_ex_id==wo_ex_id))
        db.session.commit()
    else:
        print('invalid set type')

#UPDATED, NEEDS TESTED
def fetch_users_workouts():
    results = db.session.execute(db.select(Workout).filter(and_(Workout.user_id == session['user_id'], Workout.deleted == 0))).scalars()
    return results

#UPDATED, NEEDS TESTED
def fetch_all_user_workouts():
    results = db.session.execute(db.select(Workout).where(Workout.user_id == session['user_id'])).scalars()
    return results

#UPDATED, NEEDS TESTED
def fetch_users_exercises():
        #figure out how to get the exercises based on user_id ->
        # 1. get all of a users workouts
        users_workouts = db.session.execute(db.select(Workout).where(Workout.user_id==session['user_id'])).scalars()
        workout_ids = []
        for workout in users_workouts:
            workout_ids.append(workout.workout_id)
        #workout_ids now holds all the workouts for this user
        # 2. get all the exercises that haven't been deleted
        if workout_ids:
            results = db.session.execute(db.select(Workout_Exercise).filter(Workout_Exercise.workout_id.in_(workout_ids), Workout_Exercise.deleted==0)).scalars()
            ex_ids = []
            for result in results:
                ex_ids.append(result.exercise_id)
            exercises = db.session.execute(db.select(Exercise).where(Exercise.exercise_id.in_(ex_ids))).scalars()
            #now we have all the users exercises(that haven't been deleted) in results
            return exercises

#UPDATED, NEEDS TESTED
def fetch_all_exercise_names() -> []:
    results = db.session.execute(db.select(Exercise))
    if results:
        ex_names = []
        for result in results:
            ex_names.append(result.exercise_name)
        return ex_names
    else:
        return None

#UPDATED, NEEDS TESTED
def get_exercise_id(exName) -> id:
    ex = db.session.execute(db.select(Exercise).where(Exercise.exercise_name == exName)).scalar_one_or_none()
    id = ex.exercise_id
    return id

#UPDATED, NEEDS TESTED
def get_exercises_by_workout(workout_id):

    results = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.workout_id==workout_id)).scalars()
    ex_ids = []
    for result in results:
        ex_ids.append(result.exercise_id)
    exercises = db.session.execute(db.select(Exercise).where(Exercise.exercise_id.in_(ex_ids))).scalars()
    return exercises

#UPDATED, NEEDS TESTED
def build_workout_ex_list_and_showable_ex_list():
    exercises = db.session.execute(db.select(Workout_Exercise).where(Workout_Exercise.workout_id == session['workout_under_edit'])).scalars()
    workout_exercises = {}
    for exercise in exercises:
        #if the exercise has never been deleted, add it to workout_exercises with the id mapped to the exercise_name
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



