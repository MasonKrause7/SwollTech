INSERT INTO Exercise_Type(exercise_type_name) VALUES ('Strength');
INSERT INTO Exercise_Type(exercise_type_name) VALUES ('Cardio');

INSERT INTO Exercise(exercise_name, exercise_type_id) VALUES('Bench Press', 1);
INSERT INTO Exercise(exercise_name, exercise_type_id) VALUES('Back Squat', 1);
INSERT INTO Exercise(exercise_name, exercise_type_id) VALUES('Run', 2);

INSERT INTO Workout(user_id, workout_name, deleted) VALUES(1, 'Leg Day', 0);

INSERT INTO Workout_Exercise(workout_id, exercise_id) VALUES(1, 2);
INSERT INTO Workout_Exercise(workout_id, exercise_id) VALUES(1, 3);
INSERT INTO Workout_Exercise(workout_id, exercise_id) VALUES(1, 1);

INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (1, 12, 65, 'lbs');
INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (1, 10, 85, 'lbs');
INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (1, 7, 105, 'lbs');

INSERT INTO Cardio_Set(wo_ex_id, duration_amount, duration_metric, distance_amount, distance_metric) VALUES (2, 9.25, 'minutes', 1.5, 'miles');
INSERT INTO Cardio_Set(wo_ex_id, duration_amount, duration_metric, distance_amount, distance_metric) VALUES (2, 59, 'seconds', 400, 'meters');


INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (3, 14, 95, 'lbs');
INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (3, 12, 115, 'lbs');
INSERT INTO Strength_Set(wo_ex_id, number_of_reps, weight_amount, weight_metric) VALUES (3, 10, 135, 'lbs');

INSERT INTO Sesh(user_id, workout_id, date_of_sesh) VALUES(1, 1, GETDATE());

