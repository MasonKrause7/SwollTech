USING swolltech;

DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Sesh;
DROP TABLE IF EXISTS Workout;
DROP TABLE IF EXISTS Workout_Exercise;
DROP TABLE IF EXISTS Exercise;
DROP TABLE IF EXISTS Exercise_Type;
DROP TABLE IF EXISTS Strength_Set;
DROP TABLE IF EXISTS Cardio_Set;

CREATE TABLE Users (
    user_id INTEGER NOT NULL AUTOINCREMENT,
    fname VARCHAR(50) NOT NULL,
    lname VARCHAR(50) NOT NULL,
    email VARCHAR(50) NOT NULL,
    dob DATE,
    password VARCHAR(200) NOT NULL,
    PRIMARY KEY (user_id)
);
CREATE TABLE Sesh (
    sesh_id INTEGER AUTOINCREMENT,
    user_id INTEGER,
    workout_id INTEGER,
    date_of_sesh DATE NOT NULL,
    PRIMARY KEY (sesh_id),
    FOREIGN KEY(user_id) REFERENCES Users(user_id),
    FOREIGN KEY(workout_id) REFERENCES Workout(workout_id)

);
CREATE TABLE Workout (
    workout_id INTEGER NOT NULL AUTOINCREMENT,
    user_id INTEGER,
    workout_name VARCHAR(50) NOT NULL,
    PRIMARY KEY (workout_id),
    FOREIGN KEY(user_id) REFERENCES Users(user_id)
);
CREATE TABLE Workout_Exercise (
    wo_ex_id INTEGER AUTOINCREMENT,
    workout_id INTEGER,
    exercise_id INTEGER,
    PRIMARY KEY (wo_ex_id),
    FOREIGN KEY(workout_id) REFERENCES Workout (workout_id),
    FOREIGN KEY(exercise_id) REFERENCES Exercise (exercise_id)
);
CREATE TABLE Exercise (
    exercise_id INTEGER AUTOINCREMENT,
    exercise_name VARCHAR(100),
    exercise_type_id INTEGER,
    PRIMARY KEY (exercise_id),
    FOREIGN KEY(exercise_type_id) REFERENCES Exercise_Type (exercise_type_id)
);
CREATE TABLE Exercise_Type (
    exercise_type_id INTEGER AUTOINCREMENT,
    exercise_type_name VARCHAR(50),
    PRIMARY KEY (exercise_type_id)
);

CREATE TABLE Cardio_Set (
    c_set_number INTEGER,
    wo_ex_id INTEGER,
    duration_amount DECIMAL,
    duration_metric VARCHAR(25),
    distance_amount DECIMAL,
    distance_metric VARCHAR(25),
    FOREIGN KEY (wo_ex_id) REFERENCES Workout_Exercise (wo_ex_id),
    PRIMARY KEY (c_set_number, wo_ex_id)
);
CREATE TABLE Strength_Set (
    s_set_number INTEGER,
    wo_ex_id INTEGER,
    number_of_reps INTEGER,
    weight_amount DECIMAL,
    weight_metric VARCHAR(25),
    FOREIGN KEY (wo_ex_id) REFERENCES Workout_Exercise (wo_ex_id)
    PRIMARY KEY (s_set_number, wo_ex_id)
);



