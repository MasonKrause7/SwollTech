from application import db


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

Workout_Exercise = db.Table(
    "Workout_Exercise",
    db.Column("wo_ex_id", db.Integer, primary_key=True ),
    db.Column("workout_id", db.Integer, db.ForeignKey(Workout.workout_id)),
    db.Column("exercise_id", db.Integer, db.ForeignKey(Exercise.exercise_id))
)


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
