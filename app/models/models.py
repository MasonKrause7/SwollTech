from app import db

class Users(db.Model):
    __tablename__ = "Users"
    user_id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), unique=False, nullable=False)
    lname = db.Column(db.String(80), unique=False, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    dob = db.Column(db.DateTime, unique=False, nullable=False)
    password = db.Column(db.String(200), unique=False, nullable=False)

class Workout(db.Model):
    __tablename__ = "Workout"
    workout_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_name = db.Column(db.String(100), unique=False, nullable=False)
    deleted = db.Column(db.Integer)

class Sesh(db.Model):
    __tablename__="Sesh"
    sesh_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(Users.user_id))
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    date_of_sesh = db.Column(db.DateTime, default=db.func.current_timestamp())
class Exercise_Type(db.Model):
    __tablename__ = "Exercise_Type"
    exercise_type_id = db.Column(db.Integer, primary_key=True)
    exercise_type_name = db.Column(db.String(25))
class Exercise(db.Model):
    __tablename__ = "Exercise"
    exercise_id = db.Column(db.Integer, primary_key=True)
    exercise_name = db.Column(db.String(80), nullable=False)
    exercise_type_id = db.Column(db.Integer, db.ForeignKey(Exercise_Type.exercise_type_id))
class Workout_Exercise(db.Model):
    __tablename__ = "Workout_Exercise"
    wo_ex_id = db.Column(db.Integer, primary_key=True )
    workout_id = db.Column(db.Integer, db.ForeignKey(Workout.workout_id))
    exercise_id = db.Column(db.Integer, db.ForeignKey(Exercise.exercise_id))
    deleted = db.Column(db.Integer)

class Cardio_Set(db.Model):
    __tablename__ = "Cardio_Set"
    c_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    duration_amount = db.Column(db.Float)
    duration_metric = db.Column(db.String(50))
    distance_amount = db.Column(db.Float)
    distance_metric = db.Column(db.String(50))
class Strength_Set(db.Model):
    __tablename__ = "Strength_Set"
    s_set_number = db.Column(db.Integer, primary_key=True)
    wo_ex_id = db.Column(db.Integer, db.ForeignKey(Workout_Exercise.wo_ex_id))
    sesh_id = db.Column(db.Integer, db.ForeignKey(Sesh.sesh_id))
    number_of_reps = db.Column(db.Integer)
    weight_amount = db.Column(db.Float)
    weight_metric = db.Column(db.String(25))
